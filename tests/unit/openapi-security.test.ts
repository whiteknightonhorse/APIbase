import { readFileSync } from 'fs';
import { resolve } from 'path';

type Op = Record<string, unknown> & {
  security?: Array<Record<string, string[]>>;
  'x-payment-info'?: { price?: string };
  'x-payment-required'?: boolean;
};
type Doc = {
  info: { description: string };
  security?: unknown;
  components: { securitySchemes: Record<string, { type: string; name?: string; scheme?: string }> };
  paths: Record<string, Record<string, Op>>;
};

const dir = resolve(__dirname, '..', '..', 'static', '.well-known');
const docs: Array<[string, Doc]> = [
  ['openapi.json', JSON.parse(readFileSync(resolve(dir, 'openapi.json'), 'utf-8'))],
  [
    'openapi-discovery.json',
    JSON.parse(readFileSync(resolve(dir, 'openapi-discovery.json'), 'utf-8')),
  ],
];

const keys = (o: Record<string, string[]>) => Object.keys(o).sort().join(',');

describe.each(docs)('%s security declaration (T-0651)', (_name, doc) => {
  const ops: Array<[string, Op]> = Object.entries(doc.paths).flatMap(([p, item]) =>
    Object.values(item).map((op) => [p, op] as [string, Op]),
  );

  it('declares the three schemes and the info sentence', () => {
    const s = doc.components.securitySchemes;
    expect(Object.keys(s).sort()).toEqual(['BearerAuth', 'mppPayment', 'x402Payment']);
    expect(s.x402Payment).toMatchObject({ type: 'apiKey', name: 'X-PAYMENT' });
    expect(s.mppPayment).toMatchObject({ type: 'http', scheme: 'Payment' });
    expect(doc.info.description).toContain('Authorization is payment:');
    expect(doc.security).toEqual([{}]);
  });

  it('every operation has security; paid list both rails, free are anonymous', () => {
    expect(ops.length).toBeGreaterThan(1000);
    for (const [p, op] of ops) {
      expect(op.security).toBeDefined();
      const shape = op.security!.map(keys);
      expect(shape).not.toEqual(['BearerAuth']);
      const price = Number(op['x-payment-info']?.price ?? 0);
      if (price > 0) {
        expect([p, shape]).toEqual([p, ['x402Payment', 'mppPayment']]);
        expect(op['x-payment-required']).toBe(true);
      } else {
        expect([p, shape]).toEqual([p, ['']]);
        expect(op['x-payment-required']).toBe(false);
      }
    }
  });

  it('platform routes are anonymous', () => {
    for (const p of ['/api/tools', '/api/v1/discover', '/api/v1/agents/register']) {
      if (!doc.paths[p]) continue;
      for (const op of Object.values(doc.paths[p])) expect(op.security).toEqual([{}]);
    }
  });
});
