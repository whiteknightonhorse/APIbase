import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { PAYMENT_SIGNATURE, X_PAYMENT } from '../../config/http-headers';
import { logger } from '../../config/logger';
import { defaultShopDeps, type ShopDeps } from '../merchant-lifecycle.service';
import {
  contentPortion,
  fromMicro,
  getStreamMethod,
  StreamError,
  toMicro,
  type StreamMethod,
} from '../stream-session';
import {
  discardChannel,
  findSession,
  loadStreamTarget,
  noteSettlerMisconfigured,
  recordClose,
  recordConsumption,
  recordOpen,
  recordTopUp,
  type ChannelView,
  type StreamSessionRow,
  type StreamTarget,
} from '../stream.service';

/**
 * UC-7 / F-9: `GET|POST /api/v1/shop/m/:slug/stream/:sku` — the ONLY route that issues an MPP
 * session challenge (0256 item 1: the price, the per-second rate, is known before any settlement).
 * MPP only; it sits BEFORE mppMiddleware (that one handles `tool:*` and quote pay URLs, not this).
 *
 * `?seconds=N` (1..60) is how much stream one request buys: the unit amount of the challenge is
 * `N x rate`, and mppx deducts it from the channel on every accepted `open`/`voucher` request.
 */

export const MAX_SECONDS_PER_REQUEST = 60;
const DOCS = '/docs/integrator#stream';

export interface StreamRouterOptions {
  deps?: Pick<ShopDeps, 'db' | 'transaction'>;
  /** requests per minute per address (default 120). */
  limit?: number;
}

const publicBase = () => (process.env.PUBLIC_BASE_URL || 'https://apibase.pro').replace(/\/+$/, '');
const streamUrl = (slug: string, sku: string) =>
  `${publicBase()}/api/v1/shop/m/${slug}/stream/${sku}`;

const errBody = (e: StreamError) => ({
  error: e.code,
  error_code: e.code,
  message: e.message,
  suggested_action: e.status === 400 || e.status === 402 ? 'fix_request' : 'use_different_tool',
  documentation_url: DOCS,
  ...e.extra,
});

/** `Authorization: Payment <base64url json>` -> the session action and channel id (null: no credential). */
export function readCredential(
  header: string | undefined,
): { action: string; channelId?: string } | null {
  const m = /^Payment\s+(\S+)/i.exec(header ?? '');
  if (!m) return null;
  try {
    const wire = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')) as {
      payload?: { action?: unknown; channelId?: unknown };
    };
    const action = wire.payload?.action;
    if (typeof action !== 'string') return null;
    const channelId = wire.payload?.channelId;
    return { action, ...(typeof channelId === 'string' ? { channelId } : {}) };
  } catch {
    return null;
  }
}

interface ReceiptView {
  channelId: string;
  spent: bigint;
  acceptedCumulative: bigint;
  txHash: string | null;
}

/** The session receipt mppx put in `Payment-Receipt` (base64url JSON). */
function readReceipt(res: globalThis.Response): ReceiptView | null {
  const h = res.headers.get('Payment-Receipt');
  if (!h) return null;
  try {
    const r = JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof r.channelId !== 'string') return null;
    return {
      channelId: r.channelId,
      spent: BigInt(String(r.spent ?? '0')),
      acceptedCumulative: BigInt(String(r.acceptedCumulative ?? '0')),
      txHash: typeof r.txHash === 'string' ? r.txHash : null,
    };
  } catch {
    return null;
  }
}

async function readChannel(m: StreamMethod, channelId: string): Promise<ChannelView> {
  const st = (await m.channels.getChannel(channelId)) as ChannelView | null;
  if (!st) throw new StreamError(503, 'stream_unavailable', 'channel state unavailable');
  return st;
}

async function sendFetch(res: Response, r: globalThis.Response): Promise<void> {
  res.status(r.status);
  r.headers.forEach((v, k) => res.setHeader(k, v));
  const buf = Buffer.from(await r.arrayBuffer());
  res.send(buf);
}

const parseSeconds = (raw: unknown): number => {
  if (raw === undefined) return 1;
  const s = String(raw);
  const n = Number(s);
  if (!/^\d{1,3}$/.test(s) || !Number.isInteger(n) || n < 1 || n > MAX_SECONDS_PER_REQUEST) {
    throw new StreamError(
      400,
      'bad_request',
      `seconds must be an integer from 1 to ${MAX_SECONDS_PER_REQUEST}`,
    );
  }
  return n;
};

export function createStreamRouter(opts: StreamRouterOptions = {}): Router {
  const deps = () => opts.deps ?? defaultShopDeps();
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: opts.limit ?? 120,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: 'rate_limited',
        error_code: 'rate_limited',
        message: 'too many requests from this address',
        suggested_action: 'retry_after_delay',
        documentation_url: DOCS,
      });
    },
  });

  const handle = async (req: Request, res: Response): Promise<void> => {
    const slug = String(req.params.slug);
    const sku = String(req.params.sku);
    res.set('Cache-Control', 'no-store');

    // Streams are paid over MPP only; an x402 header is a wrong-rail request, refused before any lookup.
    if (req.get(X_PAYMENT) || req.get(PAYMENT_SIGNATURE)) {
      res.status(400).json({
        error: 'bad_request',
        error_code: 'x402_not_supported',
        message:
          'Streams are paid over MPP (a Tempo session channel); X-Payment is not accepted here.',
        suggested_action: 'fix_request',
        documentation_url: DOCS,
        pay: { mpp: { url: streamUrl(slug, sku) } },
      });
      return;
    }

    const d = deps();
    const target = await loadStreamTarget(d.db, slug, sku);
    const { merchant, product } = target;
    const seconds = parseSeconds(req.query.seconds);
    // Throws 409 stream_unavailable / 500 stream_settler_misconfigured BEFORE a challenge exists.
    const method = await getStreamMethod(merchant, product.terms).catch(async (e: unknown) => {
      if (e instanceof StreamError && e.code === 'stream_settler_misconfigured') {
        await noteSettlerMisconfigured(d.db, slug, sku).catch(() => undefined);
      }
      throw e;
    });

    const auth = req.get('authorization');
    const cred = readCredential(auth);
    let session: StreamSessionRow | null = null;
    if (cred && cred.action !== 'open') {
      // vouchers / top-ups / closes only move channels THIS shop opened for THIS product
      session = cred.channelId
        ? await findSession(d.db, merchant.merchant_id, cred.channelId)
        : null;
      if (!session || session.sku !== product.sku) {
        throw new StreamError(404, 'unknown_channel', 'no such channel in this stream');
      }
      if (session.status === 'closed') {
        throw new StreamError(409, 'channel_closed', 'this channel is closed');
      }
    }

    const rateMicro = toMicro(product.terms.rate_per_s_usd);
    const unitAmount = fromMicro(rateMicro * BigInt(seconds));

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const body =
      req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0
        ? JSON.stringify(req.body)
        : undefined;
    const fetchReq = new globalThis.Request(`https://${req.get('host')}${req.originalUrl}`, {
      method: req.method,
      headers,
      body,
    });

    const result = await method.mppx.session({ amount: unitAmount })(fetchReq);
    if (result.status === 402) {
      await sendFetch(res, result.challenge);
      return;
    }

    // Verified credential. The placeholder only carries the receipt header out of mppx.
    const probe: globalThis.Response = result.withReceipt(
      new globalThis.Response(null, { status: 200 }),
    );
    const receipt = readReceipt(probe);
    const channelId = receipt?.channelId ?? cred?.channelId;
    if (!receipt || !channelId) throw new StreamError(503, 'stream_unavailable', 'no receipt');
    const ch = await readChannel(method, channelId);
    const action = cred?.action ?? 'open';

    if (action === 'open') {
      if (ch.deposit < toMicro(product.terms.min_deposit_usd)) {
        // The channel exists on-chain (the payer's money, theirs to withdraw) but is not used.
        await discardChannel(method, channelId);
        throw new StreamError(
          402,
          'deposit_below_minimum',
          'the channel deposit is below the stream minimum',
          {
            min_deposit_usd: product.terms.min_deposit_usd,
            deposit_usd: fromMicro(ch.deposit),
          },
        );
      }
      await recordOpen(
        d.db,
        target,
        { ...ch, channelId, escrowContract: ch.escrowContract, chainId: ch.chainId },
        merchant.stream_settler ?? 'apibase_pilot',
      );
      session = await findSession(d.db, merchant.merchant_id, channelId);
      if (!session) throw new StreamError(503, 'stream_unavailable', 'session not recorded');
    }
    if (!session) throw new StreamError(404, 'unknown_channel', 'no such channel in this stream');

    if (action === 'topUp') {
      await recordTopUp(d.db, session, ch);
      await sendFetch(res, probe);
      return;
    }
    if (action === 'close') {
      await recordClose(d, session, ch, receipt.txHash);
      await sendFetch(res, probe);
      return;
    }

    // open / voucher: what the channel has been charged so far is what the buyer consumed
    const consumedS = Number(receipt.spent / rateMicro);
    await recordConsumption(d.db, session, { ...ch, spent: receipt.spent }, consumedS);
    if (probe.status !== 200) {
      await sendFetch(res, probe); // a non-billable request (POST without a body): receipt only
      return;
    }
    probe.headers.forEach((v, k) => res.setHeader(k, v));
    res.status(200).json({
      channel_id: channelId.toLowerCase(),
      seconds,
      content: contentPortion(product.content, session.consumed_s, consumedS),
      consumed_s: consumedS,
      consumed_usd: fromMicro(receipt.spent),
      rate_per_s_usd: product.terms.rate_per_s_usd,
      deposit_usd: fromMicro(ch.deposit),
      highest_voucher: { cumulative_amount: fromMicro(receipt.acceptedCumulative) },
    });
  };

  router.all('/api/v1/shop/m/:slug/stream/:sku', limiter, (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.set('Allow', 'GET, POST').status(405).json({
        error: 'method_not_allowed',
        error_code: 'method_not_allowed',
        message: 'use GET or POST',
        suggested_action: 'fix_request',
        documentation_url: DOCS,
      });
      return;
    }
    handle(req, res).catch((e: unknown) => {
      if (res.headersSent) return;
      if (e instanceof StreamError) {
        res.status(e.status).json(errBody(e));
        return;
      }
      logger.error(
        { err: e instanceof Error ? e.message : String(e), slug: req.params.slug },
        'stream route failed',
      );
      res.status(503).json({
        error: 'unavailable',
        error_code: 'stream_unavailable',
        message: 'stream temporarily unavailable',
        suggested_action: 'retry_after_delay',
        documentation_url: DOCS,
      });
    });
  });

  return router;
}

export type { StreamTarget };
