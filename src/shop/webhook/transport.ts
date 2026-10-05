import { request } from 'node:https';
import type { PinnedTarget } from './ssrf';

export const WEBHOOK_TIMEOUT_MS = 10_000;
/** Read at most this much of a response: enough for a 16 KB fulfillment plus one byte to detect overflow. */
export const MAX_RESPONSE_BYTES = 16 * 1024 + 1;

export interface WebhookRequest {
  target: PinnedTarget;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}
export interface WebhookResponse {
  status: number;
  body: Buffer;
}
export type WebhookTransport = (r: WebhookRequest) => Promise<WebhookResponse>;

/**
 * POST over TLS to the pinned address (SNI and certificate check use the hostname), redirects are
 * never followed (a 3xx is simply returned), the whole exchange is bounded by `timeoutMs`.
 */
export const httpsTransport: WebhookTransport = (r) =>
  new Promise((resolve, reject) => {
    const { url, hostname, ip } = r.target;
    const req = request(
      {
        host: ip,
        servername: hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          ...r.headers,
          Host: url.host,
          'Content-Length': String(Buffer.byteLength(r.body)),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size <= MAX_RESPONSE_BYTES) chunks.push(c);
          else res.destroy();
        });
        const done = () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) });
        res.on('end', done);
        res.on('close', done);
        res.on('error', done);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('timeout')), r.timeoutMs);
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.on('close', () => clearTimeout(timer));
    req.end(r.body);
  });
