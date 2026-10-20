/** T-0514: ERC-8004 registration file + official logo assets. No DB. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const bytes = (p: string) => readFileSync(join(ROOT, p));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const dims = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

describe('T-0514 agent-registration.json', () => {
  it('is valid registration-v1 JSON', () => {
    const j = JSON.parse(bytes('static/.well-known/agent-registration.json').toString('utf8'));
    expect(j.type).toBe('https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
    for (const k of ['name', 'description', 'image']) expect(typeof j[k]).toBe('string');
    expect(Array.isArray(j.endpoints)).toBe(true);
    expect(j.endpoints.length).toBeGreaterThan(0);
    expect(j.image).toBe('https://apibase.pro/brand/apibase-logo.png');
  });

  it('is served by the /.well-known/ block as application/json', () => {
    const conf = readFileSync(join(ROOT, 'nginx/nginx.conf'), 'utf8');
    expect(conf).toMatch(
      /location \/\.well-known\/ \{\s*root \/var\/www\/static;\s*add_header Content-Type application\/json;/,
    );
  });
});

describe('T-0514 logo assets', () => {
  const official = bytes('static/brand/apibase-logo.png');
  it('serves the official logo byte-for-byte at 1254x1254', () => {
    expect(dims(official)).toEqual([1254, 1254]);
    expect(sha(official)).toBe('72f2ebd2257fa1ac84a90d1c0e8a699a17023153258aab33311a9c84248d9b7d');
    const conf = readFileSync(join(ROOT, 'nginx/nginx.conf'), 'utf8');
    expect(conf).toMatch(/location = \/brand\/apibase-logo\.png \{[^}]*image\/png/);
  });
  it('/logo.png is 918x918 and not the old pixel-knight bytes', () => {
    const b = bytes('static/logo.png');
    expect(dims(b)).toEqual([918, 918]);
    expect(sha(b)).not.toBe('998ac36ae9d5ca790080f8cd1e9810e9964f30459749e51a22c66c1d903b7c8e');
  });
  it('/icon.png is 256x256 and not the old blue icon bytes', () => {
    const b = bytes('static/icon.png');
    expect(dims(b)).toEqual([256, 256]);
    expect(sha(b)).not.toBe('55e4be25879d8a46d0a4327c76c485f494e56d269f08fd96edb1ece4e0bdc66c');
  });
});
