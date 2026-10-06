#!/usr/bin/env node
import { privateKeyToAccount } from 'viem/accounts';
import { loadKey, mppxChainOps, parseArgs, redactingLog, runPass } from './settler.js';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const key = loadKey(args);
  const account = privateKeyToAccount(key);
  const log = redactingLog([key, args.mk], (l) => console.log(`${new Date().toISOString()} ${l}`));
  log(
    `settler account ${account.address} (key length ${key.length}); the key stays on this machine`,
  );
  const chain = mppxChainOps(args.rpc);
  for (;;) {
    try {
      const r = await runPass({ api: args.api, mk: args.mk, account, chain, fetch, log });
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
