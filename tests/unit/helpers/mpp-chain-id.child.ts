/**
 * T-SHOP-B (child process of mpp-chain-id.test.ts): mppx is ESM-only and jest here is CJS, so the
 * REAL mppx/server factory runs in a tsx process. argv[2] = "true" | "false" (MPP_TESTNET).
 * Real: mpp.middleware, mpp.config, mppx. Nothing is sent anywhere; a challenge needs no Redis.
 * Prints `RESULT<json>` with the decoded challenge request.
 */
process.env.ENCRYPTION_KEY = 'k'.repeat(40);
// Required by the env schema only; this child never opens a database connection.
const DUMMY_DB = 'postgresql://u:p@127.0.0.1:1/none';
process.env.DATABASE_URL = DUMMY_DB;
process.env.DATABASE_URL_WORKER = DUMMY_DB;
process.env.DATABASE_URL_OUTBOX = DUMMY_DB;
process.env.API_KEY_SECRET = 'a'.repeat(40);
process.env.MPP_ENABLED = 'true';
process.env.MPP_TESTNET = process.argv[2] === 'true' ? 'true' : 'false';
process.env.MPP_SECRET_KEY = 'real-factory-hmac-secret-of-32-bytes-or-more';
process.env.TEMPO_WALLET_ADDRESS = '0x0000000000000000000000000000000000000002';
process.env.TEMPO_PRIVATE_KEY = `0x${'11'.repeat(32)}`;
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:55447';

async function main(): Promise<void> {
  const { buildMppChallengeHeader } = await import('../../../src/middleware/mpp.middleware');
  const header = await buildMppChallengeHeader('t', 1, 'https://sandbox.test/api/v1/x', {
    recipient: '0x0000000000000000000000000000000000000003',
  });
  const b64 = /\brequest="([^"]+)"/.exec(header ?? '')?.[1] ?? '';
  const request = b64 ? JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) : null;
  console.log(`RESULT${JSON.stringify({ header, request })}`);
  process.exit(0);
}

main().catch((err) => {
  console.log(`RESULT${JSON.stringify({ crashed: String(err) })}`);
  process.exit(0);
});
