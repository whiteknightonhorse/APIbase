/**
 * T-0566 T4 (ruling MPPX-015-1102): realm pin. mppx 0.15 made standalone credential APIs require
 * a configured matching realm or a trusted route context. APIbase must therefore (a) always have
 * a non-empty realm, (b) pass it to every Mppx.create, and (c) verify credentials only through
 * route-context handlers (`mppx.charge(params)(request)`, `subscription.handler`, `call.handler`),
 * never through a standalone `.validate(` / `.verify(` call.
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
/** Source without comments (a doc comment may name `Mppx.create(` without calling it). */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

jest.mock('../../src/config/index', () => ({
  config: {
    MPP_ENABLED: 'true',
    MPP_SECRET_KEY: 's'.repeat(32),
    TEMPO_WALLET_ADDRESS: '0x00000000000000000000000000000000000a11ce',
    TEMPO_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
    MPP_TESTNET: 'false',
    // MPP_REALM deliberately unset
  },
}));

describe('T-0566 T4: MPP realm pin', () => {
  it('(a) getMppConfig().realm defaults to apibase.pro when MPP_REALM is unset', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getMppConfig } = require('../../src/config/mpp.config');
    const realm = getMppConfig().realm;
    expect(typeof realm).toBe('string');
    expect(realm.length).toBeGreaterThan(0);
    expect(realm).toBe('apibase.pro');
  });

  it.each(['src/middleware/mpp.middleware.ts', 'src/shop/stream-session.ts'])(
    '(b) every Mppx.create( in %s passes realm: cfg.realm',
    (rel) => {
      const src = code(rel);
      const creates = (src.match(/Mppx\.create\(/g) ?? []).length;
      const realms = (src.match(/realm: cfg\.realm\b/g) ?? []).length;
      expect(creates).toBeGreaterThan(0);
      expect(realms).toBe(creates);
    },
  );

  it('(c) mpp.middleware.ts verifies credentials only through route-context handlers', () => {
    const src = code('src/middleware/mpp.middleware.ts');
    expect(src.match(/\.validate\(/g) ?? []).toEqual([]);
    expect(src.match(/\.verify\(/g) ?? []).toEqual([]);
  });
});
