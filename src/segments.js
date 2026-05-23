/**
 * Manipulação de segmentos: reagrupamento, pós-processamento, etc.
 *
 * Cada job tem um array de "segments". Cada segment tem:
 *   { start: number, end: number, text: string, words: [...] }
 *
 * Cada word tem:
 *   { start: number, end: number, word: string, score: number }
 */

// =============================================================
//  REAGRUPAMENTO INTELIGENTE
// =============================================================

const PUNCT_END = /[.!?…]/;
const PUNCT_PAUSE = /[,;:—–-]$/;

const DEFAULT_REGROUP_OPTIONS = {
  max_chars_per_line: 42,        // padrão Netflix: 42 caracteres por linha
  max_lines_per_segment: 2,      // máximo 2 linhas por bloco de legenda
  max_duration_seconds: 7,       // legenda não fica mais que 7s na tela
  min_duration_seconds: 1.0,     // não menor que 1s
  break_on_punctuation: true,    // tenta sempre quebrar em . ! ?
  merge_short_segments: true,    // junta segmentos muito curtos com vizinhos
  min_words_per_segment: 2,      // segmento muito curto = junta
};

/**
 * Pega TODAS as palavras de TODOS os segmentos em um array linear
 * (mantém só palavras com timestamps válidos).
 */
function flattenWords(segments) {
  const words = [];
  for (const seg of segments || []) {
    for (const w of seg.words || []) {
      if (typeof w.start !== 'number' || typeof w.end !== 'number') continue;
      if (w.end < w.start) continue;
      const text = String(w.word || '').trim();
      if (!text) continue;
      words.push({
        start: w.start,
        end: w.end,
        word: text,
        score: typeof w.score === 'number' ? w.score : null,
      });
    }
  }
  // ordena por start (segurança)
  words.sort((a, b) => a.start - b.start);
  return words;
}

/**
 * Reagrupa palavras em segmentos respeitando:
 *  - máximo de caracteres por linha
 *  - máximo de linhas
 *  - duração máxima
 *  - quebra preferencial em pontuação forte
 */
function regroupWordsIntoSegments(words, options = {}) {
  const opts = { ...DEFAULT_REGROUP_OPTIONS, ...options };
  if (!words || words.length === 0) return [];

  const maxChars = opts.max_chars_per_line * opts.max_lines_per_segment;
  const segments = [];
  let buffer = [];
  let bufferText = '';

  function flushBuffer() {
    if (buffer.length === 0) return;
    const start = buffer[0].start;
    const end = buffer[buffer.length - 1].end;
    const text = buffer.map((w) => w.word).join(' ').trim();
    segments.push({ start, end, text, words: [...buffer] });
    buffer = [];
    bufferText = '';
  }

  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    const tentative = bufferText ? bufferText + ' ' + w.word : w.word;
    const tentativeDuration = w.end - (buffer[0]?.start ?? w.start);
    const overLimit = tentative.length > maxChars || tentativeDuration > opts.max_duration_seconds;

    if (overLimit && buffer.length > 0) {
      flushBuffer();
    }

    buffer.push(w);
    bufferText = bufferText ? bufferText + ' ' + w.word : w.word;

    // quebra preferencial em pontuação forte se já temos um mínimo
    if (opts.break_on_punctuation && PUNCT_END.test(w.word)) {
      const dur = buffer[buffer.length - 1].end - buffer[0].start;
      const len = bufferText.length;
      if (dur >= opts.min_duration_seconds && len >= 12) {
        flushBuffer();
      }
    }
  }
  flushBuffer();

  // junta segmentos muito curtos com o próximo (se couber)
  if (opts.merge_short_segments && segments.length > 1) {
    const merged = [];
    for (const seg of segments) {
      const last = merged[merged.length - 1];
      const tooShort = (
        seg.words.length < opts.min_words_per_segment ||
        (seg.end - seg.start) < opts.min_duration_seconds
      );
      if (last && tooShort) {
        const combinedText = (last.text + ' ' + seg.text).trim();
        const combinedWords = [...last.words, ...seg.words];
        const combinedDur = seg.end - last.start;
        if (combinedText.length <= maxChars && combinedDur <= opts.max_duration_seconds) {
          last.end = seg.end;
          last.text = combinedText;
          last.words = combinedWords;
          continue;
        }
      }
      merged.push(seg);
    }
    return merged;
  }

  return segments;
}

function regroupResult(result, options = {}) {
  const words = flattenWords(result?.segments || []);
  const newSegments = regroupWordsIntoSegments(words, options);
  return {
    ...result,
    segments: newSegments,
  };
}

// =============================================================
//  PÓS-PROCESSAMENTO DE TEXTO
// =============================================================

const FILLER_WORDS_PT = /\b(uhm+|uh+|hmm+|ah+|eh+|né|tipo)\b/gi;
const FILLER_WORDS_EN = /\b(uh+|um+|hmm+|ah+|like|you know)\b/gi;
const FILLER_WORDS_HR = /\b(ovaj|znači|kao|hmm+|ah+)\b/gi;

const DEFAULT_POSTPROCESS_OPTIONS = {
  capitalize_after_period: true,    // primeira letra após . ! ?
  capitalize_first_word: true,      // primeira letra do segmento
  collapse_spaces: true,            // espaços duplicados
  remove_filler_words: false,       // remove disfluências
  fix_punctuation_spacing: true,    // remove espaço antes de , . ; ! ?
  add_period_at_end: false,         // adiciona . no final se faltar
  language: 'pt',                   // hr, pt, en, ...
};

function applyTextProcessing(text, options) {
  let t = String(text || '');
  if (!t) return t;

  if (options.collapse_spaces) {
    t = t.replace(/\s+/g, ' ').trim();
  }

  if (options.fix_punctuation_spacing) {
    t = t.replace(/\s+([,.;:!?])/g, '$1');
    t = t.replace(/([,.;:!?])([^\s\d])/g, '$1 $2');
  }

  if (options.remove_filler_words) {
    if (options.language === 'pt') t = t.replace(FILLER_WORDS_PT, '');
    if (options.language === 'en') t = t.replace(FILLER_WORDS_EN, '');
    if (options.language === 'hr') t = t.replace(FILLER_WORDS_HR, '');
    t = t.replace(/\s+/g, ' ').trim();
    t = t.replace(/\s+([,.;:!?])/g, '$1');
  }

  if (options.capitalize_first_word && t.length > 0) {
    t = t[0].toLocaleUpperCase(options.language) + t.slice(1);
  }

  if (options.capitalize_after_period) {
    t = t.replace(/([.!?]\s+)([a-zà-ÿčćžšđ])/giu, (_m, p1, p2) => {
      return p1 + p2.toLocaleUpperCase(options.language);
    });
  }

  if (options.add_period_at_end && t.length > 0 && !PUNCT_END.test(t[t.length - 1])) {
    t = t + '.';
  }

  return t;
}

function postProcessResult(result, options = {}) {
  const opts = { ...DEFAULT_POSTPROCESS_OPTIONS, ...options };
  const segments = (result?.segments || []).map((seg) => ({
    ...seg,
    text: applyTextProcessing(seg.text, opts),
  }));
  return { ...result, segments };
}

// =============================================================
//  EDIÇÃO MANUAL DE SEGMENTOS
// =============================================================

/**
 * Aplica edições do usuário em segmentos específicos.
 *
 * edits = [{ index: number, text?: string, start?: number, end?: number }]
 */
function applyEdits(result, edits = []) {
  if (!Array.isArray(edits) || edits.length === 0) return result;
  const segments = (result?.segments || []).map((seg) => ({ ...seg }));

  for (const edit of edits) {
    const i = Number(edit.index);
    if (!Number.isInteger(i) || i < 0 || i >= segments.length) continue;
    const seg = segments[i];
    if (typeof edit.text === 'string') seg.text = edit.text;
    if (typeof edit.start === 'number' && edit.start >= 0) seg.start = edit.start;
    if (typeof edit.end === 'number' && edit.end > 0) seg.end = edit.end;
    if (seg.end < seg.start) seg.end = seg.start + 0.1;
  }

  return { ...result, segments };
}

/**
 * Replace total: substitui todos os segmentos por uma nova lista.
 */
function replaceSegments(result, newSegments = []) {
  return { ...result, segments: newSegments };
}

module.exports = {
  flattenWords,
  regroupWordsIntoSegments,
  regroupResult,
  applyTextProcessing,
  postProcessResult,
  applyEdits,
  replaceSegments,
  DEFAULT_REGROUP_OPTIONS,
  DEFAULT_POSTPROCESS_OPTIONS,
};
