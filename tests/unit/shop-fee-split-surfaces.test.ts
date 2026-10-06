/**
 * T-INT-42 FS11: the public surfaces describe the Base fee-split without the banned literal and
 * through the facts key; the example client type-checks and produces a header the escrow accepts
 * (FS3 in shop-fee-split-base.test.ts consumes the same client).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { buildFeeSplitXPayment } from '../../scripts/shop/examples/x402-fee-split-client';
import { INTEGRATOR_BASE_FEE_MODE } from '../../src/shop/integrator/facts';
import { renderTokens } from '../../src/shop/integrator/tokens';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const SURFACES = [
  'static/integrator/index.html',
  'static/integrator/index.md',
  'static/integrator/agent-guide.md',
  'static/integrator/why-base-tempo.md',
  'static/pricing.html',
  'docs/payments.md',
  'docs/integrator.md',
];

describe('FS11 surfaces', () => {
  it('the facts key INTEGRATOR_BASE_FEE_MODE has the ruled wording', () => {
    expect(INTEGRATOR_BASE_FEE_MODE).toBe('in-tx for fee-split clients, invoiced otherwise');
  });

  it.each(SURFACES)('%s has no hand-typed fee percentage', (file) => {
    expect(read(file)).not.toMatch(/1[.,]5 ?%/);
  });

  it('/integrator#fee renders the facts-key text, in the fee section', () => {
    const html = renderTokens(read('static/integrator/index.html'));
    const section = html.slice(html.indexOf('<section id="fee">'));
    expect(section).toContain(INTEGRATOR_BASE_FEE_MODE);
    expect(section).not.toContain('{{');
    expect(renderTokens(read('static/integrator/why-base-tempo.md'))).toContain(
      INTEGRATOR_BASE_FEE_MODE,
    );
  });

  it('the old "on Base invoiced" wording only survives with the fee-split qualifier', () => {
    expect(read('static/pricing.html')).toContain('clients that support fee-split');
    expect(read('static/integrator/index.md')).toContain('fee split');
  });

  it('the agent guide documents the exact feeAuthorization form', () => {
    const g = read('static/integrator/agent-guide.md');
    expect(g).toContain('## Fee-split on Base: two signatures');
    expect(g).toContain('"feeAuthorization": {');
    expect(g).toContain('"signature": "0x..."');
  });
});

describe('FS11 example client', () => {
  it('type-checks', () => {
    const file = join(ROOT, 'scripts/shop/examples/x402-fee-split-client.ts');
    const program = ts.createProgram([file], {
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      types: ['node'],
    });
    const diags = ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(diags).toEqual([]);
  });

  it('builds a base64 X-Payment with two legs from the 402 challenge', async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const header = await buildFeeSplitXPayment(account, {
      accepts: [
        {
          network: 'eip155:8453',
          amount: '89000000',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          payTo: '0x00000000000000000000000000000000000b0b0b',
          extra: {
            name: 'USD Coin',
            version: '2',
            fee_split: {
              v: 1,
              fee_to: '0x00000000000000000000000000000000000fee0b',
              fee_amount: '1340000',
              merchant_amount: '87660000',
            },
          },
        },
      ],
    });
    const p = JSON.parse(Buffer.from(header, 'base64').toString());
    expect(p.payload.authorization.value).toBe('87660000');
    expect(p.payload.feeAuthorization.authorization.value).toBe('1340000');
    expect(p.payload.feeAuthorization.authorization.from).toBe(p.payload.authorization.from);
    expect(p.payload.authorization.nonce).not.toBe(p.payload.feeAuthorization.authorization.nonce);
    expect(p.payload.signature).toMatch(/^0x[0-9a-f]{130}$/);
  });
});
