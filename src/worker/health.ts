import http from 'node:http';
import { logger } from '../config/logger';

/**
 * Worker health endpoint (§12.136, §12.201).
 *
 * GET /worker/health — returns worker status, uptime, heartbeat age.
 * Internal only (port 3001, not exposed via Nginx).
 */

let startTime = Date.now();
let lastHeartbeatAt: string | null = null;

export function updateHeartbeatTimestamp(): void {
  lastHeartbeatAt = new Date().toISOString();
}

export function createHealthServer(port: number): http.Server {
  startTime = Date.now();

  const server = http.createServer((req, res) => {
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

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{"error":"not_found"}');
  });

  server.listen(port, () => {
    logger.info({ port }, 'Worker health server started');
  });

  return server;
}
