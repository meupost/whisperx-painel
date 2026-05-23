/**
 * Configuração do PM2
 * --------------------
 * Inicia: pm2 start ecosystem.config.cjs
 * Reinicia: pm2 restart transcricao
 * Ver logs: pm2 logs transcricao
 * Parar:   pm2 stop transcricao
 * Remover: pm2 delete transcricao
 */

module.exports = {
  apps: [
    {
      name: 'transcricao',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1500M',
      env: {
        NODE_ENV: 'production',
      },
      // Encoding em UTF-8 nos logs (útil em Windows com PT-BR)
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
