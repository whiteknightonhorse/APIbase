/**
 * T-0704 T7 (child process of upstream-payer-mpp-pin.test.ts): mppx is ESM-only and jest here is
 * CJS, so the REAL `Challenge` (mppx) and `tempo` (mppx/client) run in a tsx process.
 * Input: env T7_WWW = a WWW-Authenticate value recorded from the sandbox 402.
 * Optional env T7_MPPX_ROOT = absolute path of another installed mppx package (comparison runs
 * against an older version; the test itself never sets it).
 * Nothing is sent anywhere: the viem client of (b) answers RPC from a canned in-process transport.
 * Prints `RESULT<json>`.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.ENCRYPTION_KEY = 'k'.repeat(40);
// Required by the env schema only; this child never opens a database connection.
const DUMMY_DB = 'postgresql://u:p@127.0.0.1:1/none';
process.env.DATABASE_URL = DUMMY_DB;
process.env.DATABASE_URL_WORKER = DUMMY_DB;
process.env.DATABASE_URL_OUTBOX = DUMMY_DB;
process.env.API_KEY_SECRET = 'a'.repeat(40);
process.env.LOG_LEVEL = 'silent';

// Throwaway payer key (never funded anywhere) and the address record that makes the rail "ok".
const PAYER_KEY = `0x${'22'.repeat(32)}` as const;

async function main(): Promise<void> {
  const www = process.env.T7_WWW ?? '';
  const root = process.env.T7_MPPX_ROOT;
  const mppx = root
    ? await import(pathToFileURL(join(root, 'dist/index.js')).href)
    : await import('mppx');
  const client = root
    ? await import(pathToFileURL(join(root, 'dist/client/index.js')).href)
    : await import('mppx/client');
  const { createClient, custom } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { tempoModerato } = await import('viem/chains');
  // The package has an exports map without ./package.json: read the file.
  const pkgDir = root || join(__dirname, '..', '..', '..', 'node_modules', 'mppx');
  const version: string = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;

  // (a) the recorded sandbox header parses into one challenge.
  const list = mppx.Challenge.fromHeadersList(new Headers({ 'www-authenticate': www }));
  const ch = list[0];
  const a = {
    count: list.length,
    id: ch?.id,
    realm: ch?.realm,
    method: ch?.method,
    intent: ch?.intent,
    request: ch?.request,
  };

  // (b) the upstream payer's client policy signs it. The recorded challenge has expired, so its
  // expiry is moved forward (the client does not check the id HMAC; 0.17 refuses < 15 s left).
  const account = privateKeyToAccount(PAYER_KEY);
  const transport = custom({
    async request({ method }: { method: string }) {
      switch (method) {
        case 'eth_chainId':
          return `0x${(42431).toString(16)}`;
        case 'eth_estimateGas':
          return '0x30000';
        case 'eth_maxPriorityFeePerGas':
          return '0x0';
        case 'eth_gasPrice':
          return '0x4a817c800';
        case 'eth_getTransactionCount':
          return '0x0';
        case 'eth_getBlockByNumber':
          return {
            number: '0x1',
            hash: `0x${'00'.repeat(32)}`,
            baseFeePerGas: '0x4a817c800',
            gasLimit: '0x1c9c380',
            gasUsed: '0x0',
            timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}`,
            transactions: [],
          };
        default:
          // eth_fillTransaction and anything else: unsupported, viem falls back to the calls above.
          throw new Error(`unmocked ${method}`);
      }
    },
  });
  const policy = {
    chainId: 42431,
    currency: String(ch.request.currency),
    recipients: [String(ch.request.recipient)],
    maxAtomic: 1000n,
  };
  const method = client.tempo.charge({
    account,
    currencies: [policy.currency],
    maxAtomicAmount: policy.maxAtomic.toString(),
    expectedRecipients: policy.recipients,
    expectedChainId: policy.chainId,
    allowedChainIds: [policy.chainId],
    getClient: async () => createClient({ chain: tempoModerato, transport }),
  });
  const fresh = { ...ch, expires: new Date(Date.now() + 300_000).toISOString() };
  const credential: string = await method.createCredential({
    challenge: fresh,
    context: { autoSwap: false },
  });
  const blob = credential.replace(/^Payment\s+/, '');
  const decoded = JSON.parse(Buffer.from(blob, 'base64url').toString('utf8'));
  const b = {
    scheme: credential.split(' ')[0],
    prefix: credential.slice(0, 32),
    echoedId: decoded?.challenge?.id,
    payloadType: decoded?.payload?.type,
    source: decoded?.source,
  };

  // (c) a 402 without a Payment challenge (x402 only) makes the real signMpp throw, never sign.
  // The root `Challenge.fromHeadersList` throws on it (0.15.0 and 0.17.x alike); a Payment
  // challenge with another id reaches the repo's own `mpp challenge vanished`.
  const x402Only = new Headers({
    'payment-required': Buffer.from('{"x402Version":2,"accepts":[]}').toString('base64'),
    'www-authenticate': 'Bearer realm="upstream"',
  });
  let parseX402Only = 'no throw';
  try {
    parseX402Only = `list ${mppx.Challenge.fromHeadersList(x402Only).length}`;
  } catch (err) {
    parseX402Only = err instanceof Error ? err.message : String(err);
  }
  const c: { parseX402Only: string; signX402Only?: string; signOtherId?: string } = {
    parseX402Only,
  };
  if (!root) {
    const dir = mkdtempSync(join(tmpdir(), 't0704-rec-'));
    const rec = join(dir, 'server-wallets.json');
    writeFileSync(
      rec,
      JSON.stringify([
        {
          name: 'UPSTREAM_PAYER_KEY_TEMPO',
          rail: 'tempo',
          address: account.address,
          created_at: 't',
        },
      ]),
    );
    process.env.REFUND_WALLET_RECORD = rec;
    process.env.UPSTREAM_PAYER_KEY_TEMPO = PAYER_KEY;
    const { realPayerPort } = await import('../../../src/payments/upstream-payer');
    const attempt = async (h: Headers): Promise<string> => {
      try {
        await realPayerPort.signMpp(h, String(ch.id), policy);
        return 'no throw';
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    };
    c.signX402Only = await attempt(x402Only);
    c.signOtherId = await attempt(
      new Headers({ 'www-authenticate': www.replace(/\bid="[^"]+"/, 'id="another-challenge"') }),
    );
  }

  console.log(`RESULT${JSON.stringify({ version, a, b, c })}`);
  process.exit(0);
}

main().catch((err) => {
  console.log(
    `RESULT${JSON.stringify({ crashed: err instanceof Error ? err.message : String(err) })}`,
  );
  process.exit(0);
});
