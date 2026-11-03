// T-0553: the ONLY place in the repository that generates a private key (REFUND-WALLET-1026,
// operator decision 2 = B). Called by scripts/server-wallet-init.sh, never by an npm script,
// workflow, cron or fleet task.
//
//   node server-wallet-init.mjs gen <ENV_NAME> <tmpfile>   -> writes "<ENV_NAME>=0x..." into the
//        0600 tmpfile (created exclusively), prints ONLY the address on stdout.
//   node server-wallet-init.mjs record <file> <name> <rail> <address>
//        -> appends {"name","rail","address","created_at"} to the JSON array record (0600).
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const [mode, ...args] = process.argv.slice(2);

if (mode === 'gen') {
  const [name, tmp] = args;
  if (!/^[A-Z][A-Z0-9_]*$/.test(name ?? '') || !tmp) {
    console.error('usage: gen <ENV_NAME> <tmpfile>');
    process.exit(64);
  }
  const key = generatePrivateKey();
  const address = privateKeyToAccount(key).address;
  writeFileSync(tmp, `${name}=${key}\n`, { mode: 0o600, flag: 'wx' });
  chmodSync(tmp, 0o600);
  process.stdout.write(address + '\n');
} else if (mode === 'record') {
  const [file, name, rail, address] = args;
  if (!file || !name || !/^(base|tempo)$/.test(rail ?? '') || !/^0x[0-9a-fA-F]{40}$/.test(address ?? '')) {
    console.error('usage: record <file> <name> <base|tempo> <address>');
    process.exit(64);
  }
  const cur = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8') || '[]') : [];
  if (!Array.isArray(cur)) {
    console.error('record file is not a JSON array');
    process.exit(65);
  }
  cur.push({ name, rail, address, created_at: new Date().toISOString() });
  writeFileSync(file, JSON.stringify(cur, null, 2) + '\n', { mode: 0o600 });
  chmodSync(file, 0o600);
} else {
  console.error('usage: gen|record');
  process.exit(64);
}
