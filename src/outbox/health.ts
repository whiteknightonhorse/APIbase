import http from 'node:http';
import { logger } from '../config/logger';
import { register } from '../services/metrics.service';

/**
 * Outbox-worker health + metrics endpoint (§12.201, §12.169).
 *
 * GET /outbox/health — returns status, lag_ms, processed_total, backlog_size.
 * GET /metrics       — Prometheus scrape endpoint.
 * Internal only (port 3002, not exposed via Nginx).
 */

let processedTotal = 0;
let lastProcessedAt: string | null = null;
let currentLagMs = 0;
let currentBacklogSize = 0;

export function recordProcessed(count: number): void {
  processedTotal += count;
  if (count > 0) {
    lastProcessedAt = new Date().toISOString();
  }
}

export function updateLag(lagMs: number, backlogSize: number): void {
  currentLagMs = lagMs;
  currentBacklogSize = backlogSize;
}

export function createHealthServer(port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/outbox/health' && req.method === 'GET') {
      const body = JSON.stringify({
        status: 'ok',
        lag_ms: currentLagMs,
        processed_total: processedTotal,
        last_processed_at: lastProcessedAt,
        backlog_size: currentBacklogSize,
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
    logger.info({ port }, 'Outbox health server started');
  });

  return server;
}
