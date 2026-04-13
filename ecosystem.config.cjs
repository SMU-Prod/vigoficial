/**
 * PM2 Ecosystem Configuration — VIG PRO Workers
 *
 * Uso:
 *   pm2 start ecosystem.config.cjs
 *   pm2 monit
 *   pm2 logs vigi-workers
 *   pm2 restart vigi-workers
 *
 * Para VPS/servidor persistente com PM2 instalado globalmente.
 */

module.exports = {
  apps: [
    {
      name: "vigi-workers",
      script: "npx",
      args: "tsx src/workers/index.ts",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      // Logs
      error_file: "./logs/workers-error.log",
      out_file: "./logs/workers-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // Graceful shutdown
      kill_timeout: 35000, // 35s (workers têm 30s timeout interno)
      listen_timeout: 10000,
      // Restart policy
      exp_backoff_restart_delay: 1000,
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};
