/**
 * T-0427: @x402/* 2.6 -> 2.28 behaviour checklist, pinned. Real SDK (no mocks): the exports we
 * rely on still exist, V1 payloads still parse, the exact-EVM server scheme covers both our
 * networks, and the repository still avoids every API the 2.x changelog removed or tightened.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { x402ResourceServer } from '@x402/core/server';
import { isPaymentPayloadV1, parsePaymentPayload } from '@x402/core/schemas';
import { registerExactEvmScheme } from '@x402/evm/exact/server';

const ROOT = join(__dirname, '..', '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|js)$/.test(name)) out.push(p);
  }
  return out;
}
const SRC = sourceFiles(join(ROOT, 'src'));
function grep(re: RegExp): string[] {
  return SRC.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => f.slice(ROOT.length + 1));
}

describe('T-0427: @x402 2.28 surface', () => {
  it('installed SDK is >= 2.28', () => {
    for (const pkg of ['core', 'evm', 'extensions']) {
      const v = (
        JSON.parse(
          readFileSync(join(ROOT, 'node_modules', '@x402', pkg, 'package.json'), 'utf8'),
        ) as { version: string }
      ).version;
      const [maj, min] = v.split('.').map(Number);
      expect(maj).toBe(2);
      expect(min).toBeGreaterThanOrEqual(28);
    }
  });

  it('@x402/express is gone from package.json and unused', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@x402/express']).toBeUndefined();
    expect(grep(/@x402\/express/)).toEqual([]);
  });

  it('bazaar extension exports we use still exist', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const bazaar = require('@x402/extensions/bazaar') as any;
    expect(typeof bazaar.BAZAAR.key).toBe('string');
    expect(typeof bazaar.declareDiscoveryExtension).toBe('function');
    expect(typeof bazaar.validateDiscoveryExtension).toBe('function');
    expect(bazaar.bazaarResourceServerExtension).toBeDefined();
  });

  it('registerExactEvmScheme(server) covers eip155:8453 and eip155:84532 (2.25)', () => {
    const server = new x402ResourceServer([]);
    registerExactEvmScheme(server);
    expect(server.hasRegisteredScheme('eip155:8453', 'exact')).toBe(true);
    expect(server.hasRegisteredScheme('eip155:84532', 'exact')).toBe(true);
  });

  it('V1 payloads still parse (isPaymentPayloadV1)', () => {
    const v1 = {
      x402Version: 1,
      scheme: 'exact',
      network: 'base',
      payload: {
        signature: '0x' + '11'.repeat(65),
        authorization: {
          from: '0x' + '1'.repeat(40),
          to: '0x' + '2'.repeat(40),
          value: '1000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: '0x' + '3'.repeat(64),
        },
      },
    };
    expect(parsePaymentPayload(v1).success).toBe(true);
    expect(isPaymentPayloadV1(v1)).toBe(true);
  });

  it('2.23 removed constants are not imported anywhere (grep)', () => {
    expect(grep(/DEFAULT_STABLECOINS|USDC_CONFIG|DEFAULT_ASSET_BY_NETWORK/)).toEqual([]);
  });

  it('2.25 buildPaymentRequirements is never called; 2.22 no custom SchemeNetworkServer (grep)', () => {
    expect(grep(/buildPaymentRequirements\s*\(/)).toEqual([]);
    expect(grep(/implements\s+SchemeNetworkServer|SchemeNetworkServer\s*=/)).toEqual([]);
  });

  it('2.14: counterfactual ERC-6492 stays disallowed (no factory allowlist, no deploy flag)', () => {
    expect(grep(/deployERC4337WithEIP6492|eip6492AllowedFactories/)).toEqual([]);
  });

  it('2.21: every HTTPFacilitatorClient passes an explicit 30 s timeout', () => {
    for (const f of ['src/services/x402-server.service.ts', 'src/payments/local-facilitator.ts']) {
      const text = readFileSync(join(ROOT, f), 'utf8');
      const calls = text.match(/new HTTPFacilitatorClient\(\{[^}]*\}/g) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) expect(c).toContain('timeoutMs: FACILITATOR_TIMEOUT_MS');
    }
    expect(readFileSync(join(ROOT, 'src/payments/local-facilitator.ts'), 'utf8')).toContain(
      'export const FACILITATOR_TIMEOUT_MS = 30_000;',
    );
  });

  it('2.18: no code compares a facilitator reason string for equality (prefix/contains only)', () => {
    const files = [
      'src/pipeline/stages/escrow.stage.ts',
      'src/pipeline/stages/shop-settle.ts',
      'src/pipeline/stages/x402-settle.ts',
    ];
    const eq =
      /(invalidReason|errorReason|invalid_reason)\s*[!=]==?\s*['"`]|['"`]\s*[!=]==?\s*(invalidReason|errorReason)/;
    for (const f of files) expect(readFileSync(join(ROOT, f), 'utf8')).not.toMatch(eq);
    expect(grep(/(invalidReason|errorReason)\s*[!=]==?\s*['"`]/)).toEqual([]);
  });
});
