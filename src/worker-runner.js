const path = require('node:path');
const { spawn } = require('node:child_process');

const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
const WORKER_SCRIPT = path.resolve(__dirname, '..', 'python', 'worker.py');

/**
 * Executa o worker Python como processo filho.
 *
 * @param {object} params - parâmetros enviados via stdin (JSON)
 * @param {function} onProgress - callback({stage, message}) chamado a cada update
 * @returns {Promise<object>} - JSON estruturado retornado pelo worker
 */
function runWorker(params, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [WORKER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdoutBuf = '';
    let stderrBuf = '';

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stderrBuf += text;
      // Cada linha pode ser um JSON de progresso
      text.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const obj = JSON.parse(trimmed);
          if (obj && obj.type === 'progress') {
            onProgress({ stage: obj.stage, message: obj.message || '' });
          }
        } catch (_err) {
          // não-json: ignora silenciosamente
        }
      });
    });

    child.on('error', (err) => {
      reject(new Error(`Falha ao iniciar Python: ${err.message}`));
    });

    child.on('close', (code) => {
      const out = stdoutBuf.trim();
      if (!out) {
        return reject(
          new Error(
            `Worker terminou sem saída (exit code ${code}). Stderr:\n${stderrBuf.slice(-2000)}`,
          ),
        );
      }
      try {
        const parsed = JSON.parse(out);
        if (parsed && parsed.ok === false) {
          const trace = parsed.trace ? `\n${parsed.trace}` : '';
          return reject(new Error(`${parsed.error || 'Erro no worker'}${trace}`));
        }
        return resolve(parsed);
      } catch (err) {
        return reject(
          new Error(
            `Saída inválida do worker (exit ${code}). Erro: ${err.message}\nSaída:\n${out.slice(-2000)}`,
          ),
        );
      }
    });

    child.stdin.write(JSON.stringify(params));
    child.stdin.end();
  });
}

module.exports = { runWorker };
