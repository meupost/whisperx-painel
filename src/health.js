const { spawn } = require('node:child_process');

const PYTHON_BIN = process.env.PYTHON_BIN || 'python';

let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 30_000; // 30s

function runPython(args) {
  return new Promise((resolve) => {
    const child = spawn(PYTHON_BIN, args, { windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });
    child.on('error', (e) => resolve({ ok: false, code: -1, out: '', err: e.message }));
    child.on('close', (code) => resolve({ ok: code === 0, code, out: out.trim(), err: err.trim() }));
  });
}

function runFfmpeg() {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-version'], { windowsHide: true, shell: true });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.on('error', () => resolve({ ok: false }));
    child.on('close', (code) => resolve({
      ok: code === 0,
      version: (out.split('\n')[0] || '').trim(),
    }));
  });
}

async function probe() {
  const result = {
    ok: true,
    python_bin: PYTHON_BIN,
    python_ok: false,
    python_version: '',
    whisperx_ok: false,
    whisperx_version: '',
    pytorch_ok: false,
    pytorch_version: '',
    cuda_available: false,
    ffmpeg_ok: false,
    ffmpeg_version: '',
    message: '',
  };

  // Python
  const pyVer = await runPython(['--version']);
  if (!pyVer.ok) {
    result.ok = false;
    result.message = `Python nao encontrado em "${PYTHON_BIN}". Ajuste PYTHON_BIN no .env.`;
    return result;
  }
  result.python_ok = true;
  result.python_version = (pyVer.out || pyVer.err || '').trim();

  // WhisperX
  const wxVer = await runPython([
    '-c',
    'import whisperx; print(getattr(whisperx, "__version__", "instalado"))',
  ]);
  if (wxVer.ok) {
    result.whisperx_ok = true;
    result.whisperx_version = wxVer.out.trim() || 'instalado';
  } else {
    result.ok = false;
    result.message = 'WhisperX nao instalado. Rode: npm run setup';
  }

  // PyTorch
  const torchVer = await runPython([
    '-c',
    'import torch; print(torch.__version__)',
  ]);
  if (torchVer.ok) {
    result.pytorch_ok = true;
    result.pytorch_version = torchVer.out.trim();
  }

  // CUDA disponivel?
  const cudaCheck = await runPython([
    '-c',
    'import torch; print("YES" if torch.cuda.is_available() else "NO")',
  ]);
  result.cuda_available = cudaCheck.ok && cudaCheck.out.trim() === 'YES';

  // FFmpeg
  const ff = await runFfmpeg();
  result.ffmpeg_ok = ff.ok;
  result.ffmpeg_version = ff.version || '';

  return result;
}

async function getHealth(force = false) {
  const now = Date.now();
  if (!force && cache && (now - cacheAt) < CACHE_TTL_MS) {
    return cache;
  }
  cache = await probe();
  cacheAt = now;
  return cache;
}

function invalidateHealth() {
  cache = null;
  cacheAt = 0;
}

module.exports = { getHealth, invalidateHealth };
