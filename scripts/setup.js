#!/usr/bin/env node
/**
 * Setup automatico do projeto.
 * Roda: npm run setup
 *
 * - Detecta o Python correto (lendo PYTHON_BIN do .env ou tentando detectar)
 * - Verifica se PyTorch + WhisperX estao instalados; se nao, instala
 * - Cria pastas necessarias (logs, data, storage/uploads, storage/outputs)
 * - Confirma que tudo esta pronto
 */

const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Carrega .env manualmente (sem dependencia)
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.log('[setup] .env nao encontrado, copiando .env.example -> .env');
    const examplePath = path.resolve(__dirname, '..', '.env.example');
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, envPath);
    }
  }
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  });
  return env;
}

function ok(msg)   { console.log(`\x1b[32m  ✓\x1b[0m ${msg}`); }
function info(msg) { console.log(`\x1b[36m  i\x1b[0m ${msg}`); }
function warn(msg) { console.log(`\x1b[33m  !\x1b[0m ${msg}`); }
function fail(msg) { console.log(`\x1b[31m  x\x1b[0m ${msg}`); }
function step(msg) { console.log(`\n\x1b[1m=> ${msg}\x1b[0m`); }

function tryPython(bin) {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8', shell: false });
  if (r.status === 0) {
    return (r.stdout || r.stderr || '').trim();
  }
  return null;
}

function detectPython(envBin) {
  // 1. Tenta o que esta no .env
  if (envBin && envBin !== 'python') {
    const v = tryPython(envBin);
    if (v) return { bin: envBin, version: v };
  }

  // 2. Tenta caminhos conhecidos do Laragon (Windows)
  const guesses = [
    'C:/laragon/bin/python/python-3.11/python.exe',
    'C:/laragon/bin/python/python-3.10/python.exe',
    'C:/laragon/bin/python/python-3.9/python.exe',
    'python3',
    'python',
  ];
  for (const g of guesses) {
    const v = tryPython(g);
    if (v && !v.includes('Microsoft Store')) {
      return { bin: g, version: v };
    }
  }
  return null;
}

function ensureDirs() {
  const dirs = [
    'logs',
    'data',
    'storage/uploads',
    'storage/outputs',
  ];
  dirs.forEach((d) => {
    const full = path.resolve(__dirname, '..', d);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
      info(`Criado: ${d}/`);
    }
  });
}

function checkPipModule(pythonBin, moduleName) {
  const r = spawnSync(pythonBin, ['-c', `import ${moduleName}`], { encoding: 'utf8' });
  return r.status === 0;
}

function pipInstall(pythonBin, args) {
  console.log(`\n  $ ${pythonBin} -m pip install ${args.join(' ')}\n`);
  const r = spawnSync(pythonBin, ['-m', 'pip', 'install', ...args], {
    stdio: 'inherit',
  });
  return r.status === 0;
}

function getPipVersion(pythonBin, packageName) {
  const r = spawnSync(pythonBin, ['-m', 'pip', 'show', packageName], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const m = (r.stdout || '').match(/Version:\s*(.+)/);
  return m ? m[1].trim() : null;
}

function updateEnvField(key, value) {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const original = fs.readFileSync(envPath, 'utf8');
  const re = new RegExp(`^${key}\\s*=.*$`, 'm');
  let updated;
  if (re.test(original)) {
    updated = original.replace(re, `${key}=${value}`);
  } else {
    updated = `${original.replace(/\s*$/, '')}\n${key}=${value}\n`;
  }
  if (updated !== original) {
    fs.writeFileSync(envPath, updated, 'utf8');
    info(`Atualizado .env: ${key}=${value}`);
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('  Setup do Painel de Transcricao (WhisperX)');
  console.log('======================================================\n');

  step('1. Verificando dependencias do Node');
  if (!fs.existsSync(path.resolve(__dirname, '..', 'node_modules'))) {
    info('node_modules nao encontrado, rodando npm install...');
    try {
      execSync('npm install', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
    } catch (err) {
      fail('npm install falhou');
      process.exit(1);
    }
  }
  ok('Dependencias do Node OK');

  step('2. Criando pastas do projeto');
  ensureDirs();
  ok('Pastas OK');

  step('3. Detectando Python');
  const env = loadEnv();
  const py = detectPython(env.PYTHON_BIN);
  if (!py) {
    fail('Nenhum Python valido encontrado.');
    console.log(`
  Instale o Python 3.10 ou 3.11 em uma dessas opcoes:
  - Laragon: ja vem instalado se voce usa o Laragon completo
  - Manual:  https://www.python.org/downloads/ (marque "Add Python to PATH")

  Depois rode novamente: npm run setup
`);
    process.exit(1);
  }
  ok(`Python: ${py.version}`);
  ok(`Path:   ${py.bin}`);

  if (env.PYTHON_BIN !== py.bin) {
    updateEnvField('PYTHON_BIN', py.bin);
  }

  step('4. Verificando pip');
  const pipCheck = spawnSync(py.bin, ['-m', 'pip', '--version'], { encoding: 'utf8' });
  if (pipCheck.status !== 0) {
    fail('pip nao funciona neste Python');
    process.exit(1);
  }
  ok('pip OK');

  step('5. Verificando PyTorch');
  if (checkPipModule(py.bin, 'torch')) {
    const v = getPipVersion(py.bin, 'torch');
    ok(`PyTorch ${v} ja instalado`);
  } else {
    warn('PyTorch nao instalado. Instalando versao CPU (~600 MB)...');
    info('Use GPU? Edite scripts/setup.js para usar a URL CUDA, mas CPU funciona em qualquer maquina.');
    const okInstall = pipInstall(py.bin, [
      'torch',
      'torchaudio',
      '--index-url',
      'https://download.pytorch.org/whl/cpu',
    ]);
    if (!okInstall) {
      fail('Falha ao instalar PyTorch');
      process.exit(1);
    }
    ok('PyTorch instalado');
  }

  step('6. Verificando WhisperX');
  if (checkPipModule(py.bin, 'whisperx')) {
    const v = getPipVersion(py.bin, 'whisperx');
    ok(`WhisperX ${v} ja instalado`);
  } else {
    warn('WhisperX nao instalado. Instalando...');
    const okInstall = pipInstall(py.bin, ['whisperx']);
    if (!okInstall) {
      fail('Falha ao instalar WhisperX');
      process.exit(1);
    }
    ok('WhisperX instalado');
  }

  step('7. Verificando ffmpeg');
  const ffmpegCheck = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', shell: true });
  if (ffmpegCheck.status === 0) {
    const ver = (ffmpegCheck.stdout || '').split('\n')[0].trim();
    ok(`FFmpeg OK (${ver})`);
  } else {
    warn('FFmpeg nao encontrado no PATH.');
    info('Recomendado: instale com "winget install ffmpeg" no Windows ou "apt install ffmpeg" no Linux');
    info('Sem ffmpeg o WhisperX nao consegue ler audios em alguns formatos.');
  }

  step('8. Tudo pronto!');
  console.log(`
  Para iniciar o servidor:

    npm start              # modo simples (foreground)
    npm run pm2:start      # via PM2 (recomendado)
    npm run pm2:logs       # ver logs em tempo real
    npm run pm2:stop       # parar
    npm run pm2:restart    # reiniciar

  Acesse: http://localhost:${env.PORT || 3000}
`);
}

main().catch((err) => {
  fail(`Erro inesperado: ${err.message}`);
  process.exit(1);
});
