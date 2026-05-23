const fs = require('node:fs');
const path = require('node:path');
const { nanoid } = require('nanoid');

const db = require('./db');
const { runWorker } = require('./worker-runner');
const { toSrt, toVtt, toTxt } = require('./formats');

const OUTPUT_DIR = path.resolve(
  __dirname,
  '..',
  process.env.OUTPUT_DIR || 'storage/outputs',
);

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function stripExt(name) {
  return String(name || '').replace(/\.[^.]+$/, '');
}

function sanitizeFilename(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'arquivo';
}

function getJobBaseName(job) {
  return sanitizeFilename(stripExt(job.audio_filename) || 'transcricao');
}

function getJobOutDir(jobId) {
  const dir = path.join(OUTPUT_DIR, jobId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Reescreve os 4 arquivos de saída (json, srt, vtt, txt)
 * a partir de um result novo (após edição/reagrupamento/etc).
 */
function writeOutputFiles(jobId, baseName, result) {
  const outDir = getJobOutDir(jobId);
  fs.writeFileSync(path.join(outDir, `${baseName}.json`), JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, `${baseName}.srt`),  toSrt(result), 'utf8');
  fs.writeFileSync(path.join(outDir, `${baseName}.vtt`),  toVtt(result), 'utf8');
  fs.writeFileSync(path.join(outDir, `${baseName}.txt`),  toTxt(result), 'utf8');
}

/**
 * Cria um job no banco e dispara o processamento em background.
 */
function createJob(jobInput) {
  const id = nanoid(12);
  const created_at = Date.now();
  const job = {
    id,
    title: jobInput.title || jobInput.audio_filename,
    audio_filename: jobInput.audio_filename,
    audio_path: jobInput.audio_path,
    audio_size_bytes: jobInput.audio_size_bytes,
    mode: jobInput.mode,
    language: jobInput.language,
    device: jobInput.device,
    compute_type: jobInput.compute_type || null,
    model_size: jobInput.model_size,
    reference_text: jobInput.reference_text || null,
    created_at,
  };
  db.insertJob(job);

  // Dispara processamento sem bloquear a resposta HTTP
  setImmediate(() => processJob(id).catch((err) => {
    console.error(`[job ${id}] erro não capturado:`, err);
  }));

  return id;
}

async function processJob(id) {
  const job = db.getJob(id);
  if (!job) return;

  try {
    db.setProcessing(id, 'starting', 'Iniciando');

    const params = {
      audio_path: job.audio_path,
      mode: job.mode,
      language: job.language,
      device: job.device,
      compute_type: job.compute_type || undefined,
      model_size: job.model_size,
      reference_text: job.reference_text || '',
      batch_size: 8,
    };

    const result = await runWorker(params, ({ stage, message }) => {
      db.setProcessing(id, stage, message);
    });

    // Persiste arquivos de saída
    const baseName = getJobBaseName(job);
    writeOutputFiles(id, baseName, result);

    db.setDone(id, {
      duration_seconds: result.duration ?? null,
      detected_language: result.language ?? job.language,
      result_json: JSON.stringify({ segments: result.segments, language: result.language, duration: result.duration }),
    });
  } catch (err) {
    console.error(`[job ${id}] erro:`, err);
    db.setError(id, err.message || String(err));
  }
}

function getOutputPath(id, ext) {
  const job = db.getJob(id);
  if (!job) return null;
  const baseName = getJobBaseName(job);
  const file = path.join(OUTPUT_DIR, id, `${baseName}.${ext}`);
  if (!fs.existsSync(file)) return null;
  return { file, baseName };
}

/**
 * Atualiza o resultado de um job já completo (após edição/reagrupamento/pos-process)
 * e regrava os arquivos de saída.
 */
function updateJobResult(id, newResult) {
  const job = db.getJob(id);
  if (!job) throw new Error('Job não encontrado');
  if (job.status !== 'done') throw new Error('Só é possível editar jobs concluídos');

  const baseName = getJobBaseName(job);
  writeOutputFiles(id, baseName, newResult);

  db.db
    .prepare('UPDATE jobs SET result_json = ? WHERE id = ?')
    .run(
      JSON.stringify({
        segments: newResult.segments,
        language: newResult.language || job.detected_language,
        duration: newResult.duration || job.duration_seconds,
      }),
      id,
    );

  return baseName;
}

/**
 * Caminho do áudio original (para servir no player do editor).
 */
function getAudioPath(id) {
  const job = db.getJob(id);
  if (!job) return null;
  if (!job.audio_path || !fs.existsSync(job.audio_path)) return null;
  return job.audio_path;
}

module.exports = {
  createJob,
  getOutputPath,
  updateJobResult,
  getAudioPath,
  OUTPUT_DIR,
};
