const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'transcricao.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    audio_filename TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    audio_size_bytes INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('transcribe', 'align')),
    language TEXT NOT NULL,
    device TEXT NOT NULL CHECK (device IN ('cpu', 'cuda')),
    compute_type TEXT,
    model_size TEXT NOT NULL,
    reference_text TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'done', 'error')),
    progress_stage TEXT,
    progress_message TEXT,
    error_message TEXT,
    duration_seconds REAL,
    detected_language TEXT,
    result_json TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
`);

const stmts = {
  insertJob: db.prepare(`
    INSERT INTO jobs (
      id, title, audio_filename, audio_path, audio_size_bytes,
      mode, language, device, compute_type, model_size, reference_text,
      status, created_at
    ) VALUES (
      @id, @title, @audio_filename, @audio_path, @audio_size_bytes,
      @mode, @language, @device, @compute_type, @model_size, @reference_text,
      'pending', @created_at
    )
  `),
  updateProgress: db.prepare(`
    UPDATE jobs
    SET status = @status,
        progress_stage = @progress_stage,
        progress_message = @progress_message,
        started_at = COALESCE(started_at, @now)
    WHERE id = @id
  `),
  updateDone: db.prepare(`
    UPDATE jobs
    SET status = 'done',
        progress_stage = 'done',
        progress_message = 'Concluído',
        duration_seconds = @duration_seconds,
        detected_language = @detected_language,
        result_json = @result_json,
        finished_at = @now
    WHERE id = @id
  `),
  updateError: db.prepare(`
    UPDATE jobs
    SET status = 'error',
        error_message = @error_message,
        finished_at = @now
    WHERE id = @id
  `),
  getJob: db.prepare('SELECT * FROM jobs WHERE id = ?'),
  listJobs: db.prepare(`
    SELECT id, title, audio_filename, audio_size_bytes, mode, language,
           device, model_size, status, progress_stage, progress_message,
           error_message, duration_seconds, detected_language,
           created_at, started_at, finished_at
    FROM jobs
    ORDER BY created_at DESC
    LIMIT @limit OFFSET @offset
  `),
  countJobs: db.prepare('SELECT COUNT(*) as total FROM jobs'),
  deleteJob: db.prepare('DELETE FROM jobs WHERE id = ?'),
};

function insertJob(job) {
  stmts.insertJob.run(job);
}

function setProcessing(id, stage, message) {
  stmts.updateProgress.run({
    id,
    status: 'processing',
    progress_stage: stage,
    progress_message: message,
    now: Date.now(),
  });
}

function setDone(id, payload) {
  stmts.updateDone.run({
    id,
    duration_seconds: payload.duration_seconds,
    detected_language: payload.detected_language,
    result_json: payload.result_json,
    now: Date.now(),
  });
}

function setError(id, errorMessage) {
  stmts.updateError.run({
    id,
    error_message: errorMessage,
    now: Date.now(),
  });
}

function getJob(id) {
  return stmts.getJob.get(id);
}

function listJobs({ limit = 50, offset = 0 } = {}) {
  const rows = stmts.listJobs.all({ limit, offset });
  const { total } = stmts.countJobs.get();
  return { rows, total };
}

function deleteJob(id) {
  return stmts.deleteJob.run(id);
}

module.exports = {
  db,
  insertJob,
  setProcessing,
  setDone,
  setError,
  getJob,
  listJobs,
  deleteJob,
};
