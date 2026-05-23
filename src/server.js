require('dotenv').config();

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const multer = require('multer');

const db = require('./db');
const jobs = require('./jobs');
const { getHealth } = require('./health');
const segments = require('./segments');

const PORT = parseInt(process.env.PORT || '3000', 10);
const UPLOAD_DIR = path.resolve(
  __dirname,
  '..',
  process.env.UPLOAD_DIR || 'storage/uploads',
);
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '500', 10);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ACCEPTED_AUDIO_EXT = new Set([
  '.mp3', '.wav', '.m4a', '.flac', '.ogg', '.opus', '.aac', '.webm', '.mp4',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const stamp = Date.now();
      // Multer entrega o nome em latin1; reinterpretamos como UTF-8
      const fixedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      file.originalname = fixedName;
      const safe = fixedName.replace(/[^a-zA-Z0-9._-]+/g, '_');
      cb(null, `${stamp}__${safe}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ACCEPTED_AUDIO_EXT.has(ext)) {
      return cb(new Error(`Extensão não suportada: ${ext}`));
    }
    cb(null, true);
  },
});

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

// === API ===

app.get('/api/health', async (req, res) => {
  try {
    const force = String(req.query.force || '') === '1';
    const data = await getHealth(force);
    res.json({ ok: true, version: '1.0.0', ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/jobs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  const result = db.listJobs({ limit, offset });
  res.json(result);
});

app.get('/api/jobs/:id', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });
  if (job.result_json) {
    try {
      job.result = JSON.parse(job.result_json);
    } catch (_err) {
      job.result = null;
    }
    delete job.result_json;
  }
  res.json(job);
});

app.delete('/api/jobs/:id', (req, res) => {
  const id = req.params.id;
  const job = db.getJob(id);
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });

  // Remove arquivos associados
  try {
    if (job.audio_path && fs.existsSync(job.audio_path)) {
      fs.unlinkSync(job.audio_path);
    }
    const outDir = path.join(jobs.OUTPUT_DIR, id);
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`[job ${id}] falha ao remover arquivos:`, err.message);
  }

  db.deleteJob(id);
  res.json({ ok: true });
});

app.post('/api/jobs', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado (campo "audio")' });
    }

    const {
      title,
      mode = 'transcribe',
      language = 'hr',
      device = 'cpu',
      compute_type,
      model_size = 'small',
      reference_text,
    } = req.body;

    if (!['transcribe', 'align'].includes(mode)) {
      return res.status(400).json({ error: 'mode inválido' });
    }
    if (!['cpu', 'cuda'].includes(device)) {
      return res.status(400).json({ error: 'device deve ser cpu ou cuda' });
    }
    if (mode === 'align' && (!reference_text || !reference_text.trim())) {
      return res.status(400).json({
        error: 'Modo align requer reference_text (texto que foi falado no áudio)',
      });
    }

    // Auto-corrige compute_type inválido para o device escolhido
    // - CPU só aceita: int8, int8_float32, float32
    // - GPU (CUDA) aceita: float16, int8_float16, int8 (lento), float32
    let finalComputeType = compute_type;
    const cpuValid = ['int8', 'int8_float32', 'float32'];
    const cudaValid = ['float16', 'int8_float16', 'int8', 'float32'];
    if (device === 'cpu' && !cpuValid.includes(finalComputeType)) {
      finalComputeType = 'int8';
    }
    if (device === 'cuda' && !cudaValid.includes(finalComputeType)) {
      finalComputeType = 'float16';
    }

    // Valida CUDA antes de criar o job (evita erro confuso depois)
    if (device === 'cuda') {
      try {
        const health = await getHealth();
        if (!health.cuda_available) {
          return res.status(400).json({
            error: 'GPU (CUDA) não está disponível neste computador. Use CPU.',
          });
        }
      } catch (_e) {
        // se falhar a checagem, deixa passar — o worker vai dar erro claro
      }
    }

    const id = jobs.createJob({
      title: (title || '').trim() || req.file.originalname,
      audio_filename: req.file.originalname,
      audio_path: req.file.path,
      audio_size_bytes: req.file.size,
      mode,
      language,
      device,
      compute_type: finalComputeType,
      model_size,
      reference_text: reference_text || null,
    });

    res.status(201).json({ id, status: 'pending' });
  } catch (err) {
    console.error('Erro em POST /api/jobs:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/:id/download/:format', (req, res) => {
  const { id, format } = req.params;
  const ext = String(format).toLowerCase();
  if (!['srt', 'vtt', 'json', 'txt'].includes(ext)) {
    return res.status(400).json({ error: 'Formato inválido (use srt, vtt, json ou txt)' });
  }
  const out = jobs.getOutputPath(id, ext);
  if (!out) return res.status(404).json({ error: 'Arquivo ainda não disponível' });
  res.download(out.file, `${out.baseName}.${ext}`);
});

// === Editor de timestamps ===

/**
 * Servir o áudio original (com Range support para player HTML5)
 */
app.get('/api/jobs/:id/audio', (req, res) => {
  const audioPath = jobs.getAudioPath(req.params.id);
  if (!audioPath) return res.status(404).json({ error: 'Áudio não encontrado' });

  const stat = fs.statSync(audioPath);
  const range = req.headers.range;
  const ext = path.extname(audioPath).toLowerCase();
  const mimeMap = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.aac': 'audio/aac',
  };
  const mime = mimeMap[ext] || 'application/octet-stream';

  if (range) {
    const m = /bytes=(\d+)-(\d+)?/.exec(range);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      const chunkSize = (end - start) + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mime,
      });
      fs.createReadStream(audioPath, { start, end }).pipe(res);
      return;
    }
  }

  res.writeHead(200, {
    'Content-Length': stat.size,
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
  });
  fs.createReadStream(audioPath).pipe(res);
});

/**
 * Salvar edições manuais nos segmentos (texto, start, end)
 */
app.put('/api/jobs/:id/segments', (req, res) => {
  try {
    const job = db.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    if (job.status !== 'done') return res.status(400).json({ error: 'Job não está concluído' });

    const { segments: newSegments } = req.body || {};
    if (!Array.isArray(newSegments)) {
      return res.status(400).json({ error: 'Body precisa ter "segments" (array)' });
    }

    const current = JSON.parse(job.result_json || '{}');
    const updated = segments.replaceSegments(current, newSegments);
    jobs.updateJobResult(req.params.id, updated);
    res.json({ ok: true, segments: updated.segments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Aplicar reagrupamento inteligente
 * body: { max_chars_per_line, max_lines_per_segment, max_duration_seconds, ... }
 */
app.post('/api/jobs/:id/regroup', (req, res) => {
  try {
    const job = db.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    if (job.status !== 'done') return res.status(400).json({ error: 'Job não está concluído' });

    const current = JSON.parse(job.result_json || '{}');
    const updated = segments.regroupResult(current, req.body || {});
    jobs.updateJobResult(req.params.id, updated);
    res.json({ ok: true, segments: updated.segments, total: updated.segments.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Aplicar pós-processamento de texto
 * body: { capitalize_after_period, remove_filler_words, language, ... }
 */
app.post('/api/jobs/:id/postprocess', (req, res) => {
  try {
    const job = db.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    if (job.status !== 'done') return res.status(400).json({ error: 'Job não está concluído' });

    const current = JSON.parse(job.result_json || '{}');
    const lang = req.body?.language || job.detected_language || job.language || 'pt';
    const updated = segments.postProcessResult(current, { ...req.body, language: lang });
    jobs.updateJobResult(req.params.id, updated);
    res.json({ ok: true, segments: updated.segments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Erros do multer e gerais ===
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload: ${err.message}` });
  }
  if (err) {
    console.error('Erro:', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.listen(PORT, () => {
  console.log(`\n[Painel de Transcricao] rodando em: http://localhost:${PORT}`);
  console.log(`[uploads] ${UPLOAD_DIR}`);
  console.log(`[outputs] ${jobs.OUTPUT_DIR}`);
  console.log(`[python ] ${process.env.PYTHON_BIN || 'python'} (worker: python/worker.py)\n`);
});
