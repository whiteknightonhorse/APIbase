#!/usr/bin/env node
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { initKey, loadKey, parseArgs, redactingLog, runPass, viemChainOps } from './renewer.js';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'init') {
    const file = args.keyFile ?? './apibase-renewer.key';
    const r = initKey(file, () => {
      const key = generatePrivateKey();
      return { key, address: privateKeyToAccount(key).address };
    });
    console.log(`Key written to ${r.file} (mode 0600). It never leaves this machine.`);
    console.log(`Renewal key address (key_id): ${r.address}`);
    console.log('Register ONLY the address with APIbase:');
    console.log(
      `  PUT https://apibase.pro/api/v1/shop/merchants/me/renewer-key  {"key_id":"${r.address}","expires_at":"<ISO 8601 date>"}  (merchant key, scope catalog:write)`,
    );
    console.log('Fund this address with a little of the Tempo fee token: it pays the gas.');
    return;
  }
  const key = loadKey(args);
  const account = privateKeyToAccount(key);
  const log = redactingLog([key, args.mk], (l) => console.log(`${new Date().toISOString()} ${l}`));
  log(`renewer key ${account.address} (key length ${key.length}); the key stays on this machine`);
  const chain = viemChainOps(args.rpc);
  for (;;) {
    try {
      const r = await runPass({ api: args.api, mk: args.mk, key, chain, fetch, log });
      if (r.done + r.failed > 0) log(`pass: ${r.done} reported, ${r.failed} failed`);
    } catch (err) {
      log(`pass failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (args.once) return;
    await new Promise((r) => setTimeout(r, args.interval * 1000));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
