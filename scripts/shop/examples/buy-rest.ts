import { x402Client, x402HTTPClient } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

// Usage: BUYER_PRIVATE_KEY=0x... npx tsx scripts/shop/examples/buy-rest.ts <merchant-slug> <sku>
const BASE = process.env.APIBASE_URL ?? 'https://apibase.pro';
const [slug, sku] = process.argv.slice(2);
const key = process.env.BUYER_PRIVATE_KEY as `0x${string}`;
if (!slug || !sku || !key)
  throw new Error('usage: BUYER_PRIVATE_KEY=0x.. buy-rest.ts <slug> <sku>');
const json = { 'content-type': 'application/json' };

// 1. Quote. Keep buyer_token: it is the Bearer for every later call on this order.
const q = await (
  await fetch(`${BASE}/api/v1/shop/quotes`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ merchant: slug, items: [{ sku, qty: 1 }] }),
  })
).json();
const auth = { authorization: `Bearer ${q.buyer_token}` };
const payUrl = `${BASE}/api/v1/shop/quotes/${q.quote_id}/pay`;

// 2. The 402 probe: payTo and amount must be the quote's.
const probe = await fetch(payUrl, { method: 'POST', headers: { ...json, ...auth }, body: '{}' });
const challenge = await probe.json();
const want = q.pay?.accepts?.[0] ?? q.pay;
const a = challenge.accepts[0];
console.log('402 accepts[0]:', { payTo: a.payTo, amount: a.amount });
if (probe.status !== 402) throw new Error(`expected 402, got ${probe.status}`);
if (want?.payTo && want.payTo.toLowerCase() !== a.payTo.toLowerCase())
  throw new Error('payTo differs from the quote');
if (want?.amount && String(want.amount) !== String(a.amount))
  throw new Error('amount differs from the quote');

// 3. Signed retry (x402 v2). spendControls caps this client at the quoted amount.
const usd = Number(a.amount) / 1e6;
const client = x402Client.fromConfig({
  schemes: [{ network: a.network, client: new ExactEvmScheme(privateKeyToAccount(key)) }],
  spendControls: { maxAmountPerPayment: `$${usd}` },
});
const payload = await client.createPaymentPayload(challenge);
const paid = await fetch(payUrl, {
  method: 'POST',
  headers: {
    ...json,
    ...auth,
    ...new x402HTTPClient(client).encodePaymentSignatureHeader(payload),
  },
  body: '{}',
});
const reply = await paid.json();
console.log(paid.status, reply.status, reply.state);

// 4. The delivery is in the order, not in the reply: GET order_url until FULFILLED.
let order = reply.order;
for (let i = 0; i < 60 && order?.state !== 'FULFILLED'; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  order = await (await fetch(reply.order_url, { headers: auth })).json();
}
if (order?.state !== 'FULFILLED') throw new Error(`not fulfilled: ${order?.state}`);
console.log('fulfillment:', order.fulfillment);
