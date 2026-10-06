import { request } from 'node:https';
import {
  defaultResolver,
  resolvePublicTarget,
  type HostResolver,
  type PinnedTarget,
} from '../webhook/ssrf';

/** §8.5: feed imports follow the webhook URL rules, plus a size cap and a timeout. */
export const MAX_FEED_BYTES = 10 * 1024 * 1024;
const FEED_TIMEOUT_MS = 20_000;

export class FeedError extends Error {}

export interface FeedRequest {
  target: PinnedTarget;
  timeoutMs: number;
  /** The transport stops reading after this many bytes (the caller passes the cap plus one). */
  maxBytes: number;
}
export type FeedTransport = (r: FeedRequest) => Promise<{ status: number; body: Buffer }>;

/** GET over TLS to the pinned address; SNI and certificate check use the hostname; redirects are not followed. */
const httpsFeedTransport: FeedTransport = ({ target, timeoutMs, maxBytes }) =>
  new Promise((resolve, reject) => {
    const { url, hostname, ip } = target;
    const req = request(
      {
        host: ip,
        servername: hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Host: url.host,
          Accept: 'application/json, application/xml, text/xml, text/csv, */*',
          'User-Agent': 'APIbase-catalog-import/1.0',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const done = () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) });
        res.on('data', (c: Buffer) => {
          size += c.length;
          chunks.push(c);
          if (size >= maxBytes) res.destroy();
        });
        res.on('end', done);
        res.on('close', done);
        res.on('error', done);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs);
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.on('close', () => clearTimeout(timer));
    req.end();
  });

export interface FetchDeps {
  resolve?: HostResolver;
  transport?: FeedTransport;
}

/** Fetch one feed document. Throws FeedError for every refusal; the text is safe to show to the merchant. */
export async function fetchFeed(
  rawUrl: string,
  deps: FetchDeps = {},
  budget = MAX_FEED_BYTES,
): Promise<Buffer> {
  const target = await resolvePublicTarget(rawUrl, deps.resolve ?? defaultResolver);
  let res;
  try {
    res = await (deps.transport ?? httpsFeedTransport)({
      target,
      timeoutMs: FEED_TIMEOUT_MS,
      maxBytes: budget + 1,
    });
  } catch (err) {
    throw new FeedError(
      (err as Error).message === 'timeout'
        ? `feed download timed out after ${FEED_TIMEOUT_MS / 1000} s`
        : 'feed download failed',
    );
  }
  if (res.status >= 300 && res.status < 400) throw new FeedError('feed redirects are not followed');
  if (res.status !== 200) throw new FeedError(`feed answered HTTP ${res.status}`);
  if (res.body.length > budget) {
    throw new FeedError(`feed is larger than ${MAX_FEED_BYTES / (1024 * 1024)} MB`);
  }
  return res.body;
}
