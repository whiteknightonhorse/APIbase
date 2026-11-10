/**
 * T-0704 T7: the upstream payer (src/payments/upstream-payer.ts signMpp) on the installed mppx.
 * mppx is ESM-only and jest here is CJS, so the REAL `Challenge` (mppx) and `tempo` (mppx/client)
 * run in a tsx child (helpers/upstream-payer-mpp-pin.child.ts). Nothing leaves the process.
 *  (a) the sandbox 402 WWW-Authenticate value recorded on 2026-11-10 parses into one challenge
 *      with the same id, realm and request blob;
 *  (b) tempo.charge with the payer's policy signs it; the credential starts with the same scheme
 *      and prefix as on mppx 0.15.0 ("Payment eyJjaGFsbGVuZ2UiOnsiZXhw"), echoes the id and
 *      carries a `transaction` payload;
 *  (c) a 402 without a Payment challenge never yields a credential: signMpp throws
 *      "mpp challenge vanished" both when no Payment challenge is present (the root parser's own
 *      "No Payment schemes found." is caught and kept as the cause) and when a Payment challenge
 *      carries another id. The 0.17.0 client change ("no longer throws on a 402 without a Payment
 *      challenge") is in the mppx fetch wrapper, which this repo does not use.
 */
import { execFileSync } from 'child_process';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');

// Recorded from the sandbox (realm sandbox.apibase.pro, chain 42431) before the bump.
const REQUEST_BLOB =
  'eyJhbW91bnQiOiIxMDAwIiwiY3VycmVuY3kiOiIweDIwYzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJtZXRob2REZXRhaWxzIjp7ImNoYWluSWQiOjQyNDMxfSwicmVjaXBpZW50IjoiMHgyMTkxNDIzQTk4M0FCODkzRGU0QTJDMTM2OGUxZjAxQjM0OTdDQjA2In0';
const ID = 'mJ7aWpc3nbzKbk11e_dlKdRFhaLK08Q5BgtF5ITeXPM';
const WWW =
  `Payment id="${ID}", realm="sandbox.apibase.pro", method="tempo", intent="charge", ` +
  `request="${REQUEST_BLOB}", expires="2026-11-10T05:30:59.829Z", ` +
  'opaque="eyJfbXBweF9ub25jZSI6IjB4MWVmOTQ2NGZhODAxMDAzZWJhZjgyMTUxZmU3YjI2NTIzYzQ5YTFhMDY0OGE0ZmY3NjExNjk5NDYzYWNiMDg4OCJ9"';

interface ChildResult {
  crashed?: string;
  version: string;
  a: { count: number; id: string; realm: string; method: string; intent: string; request: unknown };
  b: { scheme: string; prefix: string; echoedId: string; payloadType: string; source: string };
  c: {
    parseX402Only: string;
    signX402Only?: string;
    signX402OnlyCause?: string;
    signOtherId?: string;
  };
}

let r: ChildResult;
beforeAll(() => {
  const out = execFileSync(
    path.join(root, 'node_modules/.bin/tsx'),
    [path.join(__dirname, 'helpers/upstream-payer-mpp-pin.child.ts')],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 90000,
      env: { ...process.env, T7_WWW: WWW, T7_MPPX_ROOT: '' },
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  r = JSON.parse(out.split('RESULT')[1]);
}, 120000);

describe('T-0704 T7: upstream payer on the installed mppx', () => {
  it('the child ran on mppx 0.17.x', () => {
    expect(r.crashed).toBeUndefined();
    expect(r.version).toMatch(/^0\.17\./);
  });

  it('(a) Challenge.fromHeadersList parses the sandbox header into one identical challenge', () => {
    expect(r.a.count).toBe(1);
    expect(r.a.id).toBe(ID);
    expect(r.a.realm).toBe('sandbox.apibase.pro');
    expect(r.a.method).toBe('tempo');
    expect(r.a.intent).toBe('charge');
    expect(r.a.request).toEqual(
      JSON.parse(Buffer.from(REQUEST_BLOB, 'base64url').toString('utf8')),
    );
  });

  it('(b) tempo.charge with the payer policy signs a credential with the 0.15.0 prefix', () => {
    expect(r.b.scheme).toBe('Payment');
    expect(r.b.prefix).toBe('Payment eyJjaGFsbGVuZ2UiOnsiZXhw');
    expect(r.b.echoedId).toBe(ID);
    expect(r.b.payloadType).toBe('transaction');
    expect(r.b.source).toMatch(/^did:pkh:eip155:42431:0x[0-9a-fA-F]{40}$/);
  });

  it('(c) a 402 without a Payment challenge never yields a credential', () => {
    // mppx's own parser refuses it; signMpp turns that into the repo's one refusal.
    expect(r.c.parseX402Only).toBe('No Payment schemes found.');
    expect(r.c.signX402Only).toBe('mpp challenge vanished');
    expect(r.c.signX402OnlyCause).toBe('No Payment schemes found.');
    expect(r.c.signOtherId).toBe('mpp challenge vanished');
  });

  it('(c) src imports mppx/client only in upstream-payer.ts, and only `tempo` from it', () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== 'node_modules' && name !== 'dist') walk(p);
        } else if (/\.ts$/.test(name) && readFileSync(p, 'utf8').includes("'mppx/client'")) {
          hits.push(path.relative(root, p));
        }
      }
    };
    walk(path.join(root, 'src'));
    for (const pkg of readdirSync(path.join(root, 'packages'))) {
      const src = path.join(root, 'packages', pkg, 'src');
      try {
        if (statSync(src).isDirectory()) walk(src);
      } catch {
        // package without src/
      }
    }
    // the ambient module declaration is a type, not an import
    expect(hits.filter((h) => h !== 'src/types/mppx.d.ts')).toEqual([
      'src/payments/upstream-payer.ts',
    ]);
    const src = readFileSync(path.join(root, 'src/payments/upstream-payer.ts'), 'utf8');
    expect(src.match(/import\('mppx\/client'\)/g)).toHaveLength(1);
    expect(src).toContain("const { tempo } = await import('mppx/client');");
  });
});
