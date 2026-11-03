import { BaseAdapter } from '../base.adapter';
import { logger } from '../../config/logger';
import {
  ProviderErrorCode,
  type ProviderError,
  type ProviderRawResponse,
  type ProviderRequest,
} from '../../types/provider';
import {
  realPayerPort,
  reserveDailySpend,
  upstreamGate,
  upstreamPayTotal,
  upstreamSpendUsdTotal,
  type PayRail,
  type PayerPort,
  type X402Accept,
  type X402PaymentRequired,
} from '../../payments/upstream-payer';
import { chainOf, toMicro, upstreamConfigFor, type UpstreamPayConfig } from './config';

export * from './config';

/**
 * T-0655 upstream-paid adapter kind (MARKET-SIGNALS-1102 S21). One adapter class serves every
 * provider that has an `upstream_pay` block in config/tool_provider_config.yaml: it calls the
 * provider, reads the provider's own 402 challenge (x402 v2 on Base or MPP on Tempo), refuses it
 * unless network, asset, payTo and price fit the declared block, pays it from the dedicated payer
 * wallet (src/payments/upstream-payer.ts) and returns the provider's 200.
 *
 * Money rules (docs/payments.md "Upstream-paid providers"):
 *  - the buyer's price is the tool's fixed price_usd (written at onboarding with
 *    upstreamToolPriceUsd), never derived from the provider's challenge;
 *  - this adapter pays only through callPaid(), which the PROVIDER_CALL stage invokes only
 *    after the buyer's x402 payment was verified or the MPP charge settled; call() never pays;
 *  - every refusal happens before any signing; no retries of a paid request.
 */

// ---------------------------------------------------------------------------
// Challenge parsing and checks (pure; run before any signing)
// ---------------------------------------------------------------------------

export type Refusal =
  | 'upstream_challenge_unreadable'
  | 'upstream_network_mismatch'
  | 'upstream_asset_mismatch'
  | 'upstream_payto_not_allowed'
  | 'upstream_price_exceeded';

type Pick<T> = { ok: true; choice: T } | { ok: false; refusal: Refusal };

/** Narrow candidates step by step; the first step that empties the set names the refusal. */
function narrow<T>(all: T[], steps: Array<[Refusal, (c: T) => boolean]>): Pick<T> {
  let cur = all;
  if (cur.length === 0) return { ok: false, refusal: 'upstream_challenge_unreadable' };
  for (const [refusal, keep] of steps) {
    cur = cur.filter(keep);
    if (cur.length === 0) return { ok: false, refusal };
  }
  return { ok: true, choice: cur[0] };
}

const eqAddr = (a: unknown, b: string): boolean =>
  typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

export function decodeX402Required(header: string | null): X402PaymentRequired | null {
  if (!header) return null;
  try {
    const v = JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as X402PaymentRequired;
    return v && v.x402Version === 2 && Array.isArray(v.accepts) ? v : null;
  } catch {
    return null;
  }
}

export function pickX402(required: X402PaymentRequired, cfg: UpstreamPayConfig): Pick<X402Accept> {
  const max = BigInt(toMicro(cfg.max_price_usd));
  return narrow(
    required.accepts.filter((a) => a && a.scheme === 'exact' && /^\d+$/.test(String(a.amount))),
    [
      ['upstream_network_mismatch', (a) => a.network === cfg.network],
      ['upstream_asset_mismatch', (a) => eqAddr(a.asset, cfg.asset)],
      ['upstream_payto_not_allowed', (a) => cfg.pay_to_allowlist.some((p) => eqAddr(a.payTo, p))],
      ['upstream_price_exceeded', (a) => BigInt(a.amount) <= max],
    ],
  );
}

export interface MppChallenge {
  id: string;
  method: string;
  intent: string;
  amount: string;
  currency: string;
  recipient: string;
  chainId: number | null;
  hasSplits: boolean;
}

/** Minimal RFC 9110 auth-params reader for `WWW-Authenticate: Payment ...` (merged headers ok). */
export function parseMppChallenges(header: string | null): MppChallenge[] {
  if (!header) return [];
  const out: MppChallenge[] = [];
  const re =
    /\s*,?\s*(?:([A-Za-z][A-Za-z0-9_-]*)\s+(?=[A-Za-z0-9_-]+=))?([A-Za-z0-9_-]+)=(?:"((?:[^"\\]|\\.)*)"|([^,\s]*))/gy;
  let cur: Record<string, string> | null = null;
  const flush = () => {
    if (!cur) return;
    try {
      const req = JSON.parse(Buffer.from(cur.request ?? '', 'base64url').toString('utf8'));
      out.push({
        id: cur.id ?? '',
        method: cur.method ?? '',
        intent: cur.intent ?? '',
        amount: String(req.amount ?? ''),
        currency: String(req.currency ?? ''),
        recipient: String(req.recipient ?? ''),
        chainId: typeof req.methodDetails?.chainId === 'number' ? req.methodDetails.chainId : null,
        hasSplits: Array.isArray(req.methodDetails?.splits) && req.methodDetails.splits.length > 0,
      });
    } catch {
      /* unreadable challenge is skipped */
    }
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(header)) !== null) {
    if (m[1]) {
      flush();
      cur = m[1] === 'Payment' ? {} : null;
    }
    if (cur) cur[m[2]] = m[3] !== undefined ? m[3].replace(/\\(.)/g, '$1') : (m[4] ?? '');
  }
  flush();
  return out;
}

export function pickMpp(all: MppChallenge[], cfg: UpstreamPayConfig): Pick<MppChallenge> {
  const max = BigInt(toMicro(cfg.max_price_usd));
  return narrow(
    all.filter(
      (c) =>
        c.method === 'tempo' && c.intent === 'charge' && !c.hasSplits && /^\d+$/.test(c.amount),
    ),
    [
      ['upstream_network_mismatch', (c) => c.chainId === chainOf(cfg.network)],
      ['upstream_asset_mismatch', (c) => eqAddr(c.currency, cfg.asset)],
      [
        'upstream_payto_not_allowed',
        (c) => cfg.pay_to_allowlist.some((p) => eqAddr(c.recipient, p)),
      ],
      ['upstream_price_exceeded', (c) => BigInt(c.amount) <= max],
    ],
  );
}

/** Upstream settlement tx from PAYMENT-RESPONSE (x402) or Payment-Receipt (MPP), else null. */
export function upstreamTxFrom(headers: Headers): string | null {
  for (const name of ['payment-response', 'x-payment-response', 'payment-receipt']) {
    const v = headers.get(name);
    if (!v) continue;
    for (const enc of ['base64', 'base64url'] as const) {
      try {
        const j = JSON.parse(Buffer.from(v, enc).toString('utf8')) as Record<string, unknown>;
        for (const k of ['transaction', 'reference', 'txHash', 'hash']) {
          const t = j[k];
          if (typeof t === 'string' && /^0x[0-9a-fA-F]{64}$/.test(t)) return t.toLowerCase();
        }
      } catch {
        /* try next encoding */
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/** Attached to the raw response and to thrown errors, read by the PROVIDER_CALL stage. */
export interface UpstreamOutcome {
  provider: string;
  rail: PayRail;
  /** paid | free | refused_* | upstream_error | loss */
  result: string;
  /** USD actually paid upstream (0 when nothing was paid). */
  paidUsd: number;
  /** USD paid without a delivered 200 (bounded by max_price_usd). */
  lossUsd: number;
  tx: string | null;
}

export type UpstreamRaw = ProviderRawResponse & { upstream: UpstreamOutcome };
export type UpstreamError = ProviderError & { upstream: UpstreamOutcome };

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 1_048_576;

export class Upstream402Adapter extends BaseAdapter {
  constructor(
    provider: string,
    private readonly port: PayerPort = realPayerPort,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {
    super({ provider, baseUrl: 'https://upstream-402.invalid', maxRetries: 0 });
  }

  protected buildRequest(): never {
    throw new Error('Upstream402Adapter builds its own requests');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  /** Never pays: an upstream-paid tool is only served through callPaid(). */
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    throw this.fail(req, 'upstream_buyer_payment_required', 503, 'refused_unpaid', 0, null);
  }

  private fail(
    req: ProviderRequest,
    code: string,
    httpStatus: number,
    result: string,
    lossUsd: number,
    tx: string | null,
    durationMs = 0,
    message?: string,
  ): UpstreamError {
    const cfg = upstreamConfigFor(this.provider);
    upstreamPayTotal.inc({ provider: this.provider, result });
    return {
      code: code as ProviderError['code'],
      httpStatus,
      message:
        message ?? `Upstream provider payment refused or failed: ${code}; you are not charged`,
      provider: this.provider,
      toolId: req.toolId,
      durationMs,
      upstream: {
        provider: this.provider,
        rail: cfg?.rail ?? 'x402',
        result,
        paidUsd: lossUsd,
        lossUsd,
        tx,
      },
    };
  }

  private async send(
    route: { method: 'GET' | 'POST'; url: string },
    params: unknown,
    extra: Record<string, string>,
  ): Promise<{ res: Response; text: string }> {
    const p = (params && typeof params === 'object' ? params : {}) as Record<string, unknown>;
    let url = route.url;
    let body: string | undefined;
    const headers: Record<string, string> = { accept: 'application/json', ...extra };
    if (route.method === 'GET') {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
          qs.set(k, String(v));
      }
      const s = qs.toString();
      if (s) url += (url.includes('?') ? '&' : '?') + s;
    } else {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(p);
    }
    const res = await this.fetchImpl(url, {
      method: route.method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('upstream response too large');
    return { res, text };
  }

  private ok(res: Response, text: string, started: number, out: UpstreamOutcome): UpstreamRaw {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { content: text };
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return {
      status: res.status,
      headers,
      body,
      durationMs: Date.now() - started,
      byteLength: Buffer.byteLength(text),
      upstream: out,
    };
  }

  /**
   * The paid call. `buyer` is the evidence that the buyer already paid (x402 verified / MPP
   * settled); the PROVIDER_CALL stage passes it, nothing else may.
   */
  async callPaid(
    req: ProviderRequest,
    buyer: { x402Paid?: boolean; mppPaid?: boolean },
  ): Promise<UpstreamRaw> {
    const started = Date.now();
    const provider = this.provider;
    if (!buyer.x402Paid && !buyer.mppPaid) {
      throw this.fail(req, 'upstream_buyer_payment_required', 503, 'refused_unpaid', 0, null);
    }
    const cfg = upstreamConfigFor(provider);
    const route = cfg?.tools[req.toolId];
    if (!cfg || !route) {
      throw this.fail(req, 'upstream_not_configured', 503, 'refused_config', 0, null);
    }
    const gate = await upstreamGate({
      provider,
      rail: cfg.rail,
      chainId: chainOf(cfg.network),
      asset: cfg.asset,
      maxPriceMicro: toMicro(cfg.max_price_usd),
    });
    if (gate) {
      const e = this.fail(req, 'tool_unavailable', 503, 'refused_gate', 0, null);
      e.message = `Upstream payer unavailable (${gate.reason}); you are not charged`;
      e.retryAfter = gate.retryAfter;
      throw e;
    }

    // 1. Unpaid round trip: read the provider's challenge.
    let first: { res: Response; text: string };
    try {
      first = await this.send(route, req.params, {});
    } catch {
      throw this.fail(
        req,
        ProviderErrorCode.TIMEOUT,
        504,
        'upstream_error',
        0,
        null,
        Date.now() - started,
      );
    }
    if (first.res.status >= 200 && first.res.status < 300) {
      upstreamPayTotal.inc({ provider, result: 'free' });
      return this.ok(first.res, first.text, started, {
        provider,
        rail: cfg.rail,
        result: 'free',
        paidUsd: 0,
        lossUsd: 0,
        tx: null,
      });
    }
    if (first.res.status !== 402) {
      const input = first.res.status >= 400 && first.res.status < 500;
      throw this.fail(
        req,
        input ? ProviderErrorCode.INPUT_REJECTED : ProviderErrorCode.UNAVAILABLE,
        input ? 422 : 502,
        'upstream_error',
        0,
        null,
        Date.now() - started,
        `Upstream answered ${first.res.status} before payment; you are not charged`,
      );
    }

    // 2. Check the challenge against the declared block. Nothing is signed before this passes.
    let header: { name: string; value: string };
    let amountMicro: number;
    if (cfg.rail === 'x402') {
      const required = decodeX402Required(first.res.headers.get('payment-required'));
      if (!required) {
        throw this.fail(
          req,
          'upstream_challenge_unreadable',
          502,
          'refused_challenge_unreadable',
          0,
          null,
        );
      }
      const pick = pickX402(required, cfg);
      if (!pick.ok)
        throw this.fail(req, pick.refusal, 502, `refused_${pick.refusal.slice(9)}`, 0, null);
      amountMicro = Number(pick.choice.amount);
      if (!(await reserveDailySpend(provider, amountMicro))) {
        throw this.fail(req, 'tool_unavailable', 503, 'refused_daily_cap', 0, null);
      }
      header = {
        name: 'PAYMENT-SIGNATURE',
        value: await this.port.signX402(required, pick.choice),
      };
    } else {
      const pick = pickMpp(parseMppChallenges(first.res.headers.get('www-authenticate')), cfg);
      if (!pick.ok)
        throw this.fail(req, pick.refusal, 502, `refused_${pick.refusal.slice(9)}`, 0, null);
      amountMicro = Number(pick.choice.amount);
      if (!(await reserveDailySpend(provider, amountMicro))) {
        throw this.fail(req, 'tool_unavailable', 503, 'refused_daily_cap', 0, null);
      }
      const value = await this.port.signMpp(first.res.headers, pick.choice.id, {
        chainId: chainOf(cfg.network),
        currency: cfg.asset,
        recipients: cfg.pay_to_allowlist,
        maxAtomic: BigInt(toMicro(cfg.max_price_usd)),
      });
      header = { name: 'Authorization', value };
    }
    const amountUsd = amountMicro / 1e6;

    // 3. Paid request. From here a failure may have moved our money: count it as a loss unless
    // the provider clearly did not settle (it answered 402 again, x402 without a settle header).
    let paid: { res: Response; text: string };
    try {
      paid = await this.send(route, req.params, { [header.name]: header.value });
    } catch {
      upstreamSpendUsdTotal.inc({ provider }, amountUsd);
      this.logLoss(req, amountUsd, null, 'transport');
      throw this.fail(
        req,
        ProviderErrorCode.TIMEOUT,
        504,
        'loss',
        amountUsd,
        null,
        Date.now() - started,
      );
    }
    const tx = upstreamTxFrom(paid.res.headers);
    if (paid.res.status >= 200 && paid.res.status < 300) {
      upstreamSpendUsdTotal.inc({ provider }, amountUsd);
      upstreamPayTotal.inc({ provider, result: 'paid' });
      return this.ok(paid.res, paid.text, started, {
        provider,
        rail: cfg.rail,
        result: 'paid',
        paidUsd: amountUsd,
        lossUsd: 0,
        tx,
      });
    }
    const settled = tx !== null || cfg.rail === 'mpp';
    const lossUsd = settled && paid.res.status !== 402 ? amountUsd : 0;
    if (lossUsd > 0) {
      upstreamSpendUsdTotal.inc({ provider }, lossUsd);
      this.logLoss(req, lossUsd, tx, `status_${paid.res.status}`);
    }
    throw this.fail(
      req,
      ProviderErrorCode.UNAVAILABLE,
      502,
      lossUsd > 0 ? 'loss' : 'upstream_error',
      lossUsd,
      tx,
      Date.now() - started,
      `Upstream answered ${paid.res.status} after payment; you are not charged`,
    );
  }

  private logLoss(req: ProviderRequest, usd: number, tx: string | null, why: string): void {
    logger.error(
      {
        request_id: req.requestId,
        provider: this.provider,
        tool_id: req.toolId,
        upstream_loss_usd: usd,
        upstream_tx: tx,
        why,
      },
      'upstream_loss: paid the provider without a delivered result',
    );
  }
}
