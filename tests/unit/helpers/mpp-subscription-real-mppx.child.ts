/**
 * T-0431 MS-real (child process of mpp-subscription-real-mppx.test.ts). mppx is ESM-only and jest
 * here is CJS, so the REAL `mppx/server` factory runs in a tsx process: the runtime built by
 * `createMppSubscriptionRuntime` (src/middleware/mpp.middleware.ts) issues a `subscription`
 * challenge for a quote pay URL. Faked: only the store (in memory) and the MPP config (env).
 * No network, no database. Prints `RESULT<json>`.
 */
process.env.ENCRYPTION_KEY = 'k'.repeat(40);
// config validation only; nothing here opens a database connection
for (const k of ['DATABASE_URL', 'DATABASE_URL_WORKER', 'DATABASE_URL_OUTBOX']) {
  process.env[k] = 'postgresql://unused@127.0.0.1:1/unused';
}
process.env.API_KEY_SECRET = 's'.repeat(40);
process.env.MPP_ENABLED = 'true';
process.env.MPP_TESTNET = 'true';
process.env.MPP_SECRET_KEY = 'real-factory-hmac-secret-of-32-bytes-or-more';
process.env.TEMPO_WALLET_ADDRESS = '0x0000000000000000000000000000000000000002';
process.env.TEMPO_PRIVATE_KEY = `0x${'11'.repeat(32)}`;

const QUOTE = '3f0c1d2e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const MERCHANT = '0x00000000000000000000000000000000000c0c0c';
const URL_BASE = `https://apibase.pro/api/v1/shop/quotes/${QUOTE}/pay`;

async function main(): Promise<Record<string, unknown>> {
  const { Store } = await import('mppx/server');
  const { Challenge } = await import('mppx');
  const { createMppSubscriptionRuntime } = await import('../../../src/middleware/mpp.middleware');
  const rt = await createMppSubscriptionRuntime(Store.memory());
  if (!rt) return { crashed: 'no runtime' };
  const expires = new Date(Math.floor((Date.now() + 30 * 86_400_000) / 1000) * 1000).toISOString();
  const call = (unit: string, count = '1', url = `${URL_BASE}?intent=subscription`) =>
    rt.mppx.subscription({
      amount: '5',
      chainId: rt.chainId,
      periodCount: count,
      periodUnit: unit,
      recipient: MERCHANT,
      subscriptionExpires: expires,
      externalId: QUOTE,
    })(new Request(url, { method: 'POST' }));

  const out: Record<string, unknown> = {};
  const day = await call('day');
  out.dayStatus = day.status;
  const header: string = day.challenge.headers.get('WWW-Authenticate');
  out.headerCount = (header.match(/Payment /g) ?? []).length;
  const ch = Challenge.fromResponse(day.challenge) as any;
  out.challenge = {
    method: ch.method,
    intent: ch.intent,
    realm: ch.realm,
    request: ch.request,
  };
  const week = await call('week', '2');
  out.weekRequest = (Challenge.fromResponse(week.challenge) as any).request;
  // a challenge for another URL (no quote id) cannot be resolved to a subscription
  try {
    const other = await call('day', '1', 'https://apibase.pro/api/v1/tools/x/call');
    out.otherStatus = other.status;
  } catch (e) {
    out.otherError = (e as Error).message.slice(0, 120);
  }
  try {
    const month = await call('month');
    out.monthStatus = month.status;
  } catch (e) {
    out.monthError = (e as Error).message.slice(0, 160);
  }
  return out;
}

main()
  .then((r) => {
    process.stdout.write(`RESULT${JSON.stringify(r)}`);
    process.exit(0);
  })
  .catch((e) => {
    process.stdout.write(`RESULT${JSON.stringify({ crashed: String(e?.stack ?? e) })}`);
    process.exit(0);
  });
