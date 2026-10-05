import { readFileSync, writeFileSync } from 'fs';
import { shopToolsDigest } from '../src/shop/tool-definitions';

// INT-16 (§8.3 p.5): refresh `shop_tools` {version, count, sha256} in the server-card after a
// shop.* tool definition changed. Needs the app env (same as the server): tsx scripts/gen-shop-tools-hash.ts
async function main() {
  const file = 'static/.well-known/mcp/server-card.json';
  const card = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const shop_tools = await shopToolsDigest();
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(card)) {
    if (k === 'shop_tools') continue;
    next[k] = v;
    if (k === 'hasTools') next.shop_tools = shop_tools;
  }
  writeFileSync(file, JSON.stringify(next, null, 2));
  console.log('server-card shop_tools:', JSON.stringify(shop_tools));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
