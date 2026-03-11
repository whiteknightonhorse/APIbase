import http from 'node:http';
import { logger } from '../config/logger';
import { register } from '../services/metrics.service';

/**
 * Worker health + metrics endpoint (§12.136, §12.201, §12.169).
 *
 * GET /worker/health — returns worker status, uptime, heartbeat age.
 * GET /metrics       — Prometheus scrape endpoint.
 * Internal only (port 3001, not exposed via Nginx).
 */

let startTime = Date.now();
let lastHeartbeatAt: string | null = null;

export function updateHeartbeatTimestamp(): void {
  lastHeartbeatAt = new Date().toISOString();
}

export function createHealthServer(port: number): http.Server {
  startTime = Date.now();

  const server = http.createServer(async (req, res) => {
    if (req.url === '/worker/health' && req.method === 'GET') {
      const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

      const body = JSON.stringify({
        status: 'ok',
        uptime_seconds: uptimeSeconds,
        last_heartbeat_at: lastHeartbeatAt,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }

    if (req.url === '/metrics' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': register.contentType });
      res.end(await register.metrics());
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{"error":"not_found"}');
  });

  server.listen(port, () => {
    logger.info({ port }, 'Worker health server started');
  });

  return server;
}
