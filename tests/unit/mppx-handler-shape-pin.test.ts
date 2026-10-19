/**
 * T-0497: source pin for the mppx 0.13.5 replay result shape. The charge handler never returns
 * status 403; it returns { challenge: <403 problem-details Response>, status: 402 }.
 * isReplayedCredential in src/middleware/mpp.middleware.ts depends on this.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MSG =
  'mppx changed the replay result shape: re-check isReplayedCredential in src/middleware/mpp.middleware.ts';
const read = (rel: string) => readFileSync(join(ROOT, 'node_modules', 'mppx', 'dist', rel), 'utf8');

function check(cond: boolean): void {
  if (!cond) throw new Error(MSG);
}

describe('T-0497: mppx handler replay shape pin', () => {
  it('server/Mppx.js returns { challenge: response, status: 402 }', () => {
    check(read('server/Mppx.js').includes('return { challenge: response, status: 402 };'));
  });

  it('server/Transport.js answers a 403 error with problem+json', () => {
    const t = read('server/Transport.js');
    check(t.includes('if (error?.status === 403)'));
    check(t.includes("'application/problem+json'"));
  });

  it('Errors.js CredentialReplayedError has status = 403', () => {
    const e = read('Errors.js');
    const i = e.indexOf('class CredentialReplayedError');
    check(i >= 0);
    check(e.indexOf('status = 403', i) > i);
  });

  it('installed mppx satisfies the package.json range', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const range = pkg.dependencies['mppx'];
    const installed = (
      JSON.parse(readFileSync(join(ROOT, 'node_modules', 'mppx', 'package.json'), 'utf8')) as {
        version: string;
      }
    ).version;
    const base = range
      .replace(/^[^\d]*/, '')
      .split('.')
      .map(Number);
    const got = installed.split('.').map(Number);
    check(got[0] === base[0] && got[1] === base[1] && got[2] >= base[2]);
  });
});
