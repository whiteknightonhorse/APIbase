/**
 * PAYGRAPH-1114: the public list of team and test wallets is held equal to internal-wallets.json.
 * A new entry in the config needs the same entry here and a new version in the same commit.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const raw = readFileSync(join(ROOT, 'static/policy/test-wallets.json'), 'utf-8');
const pub = JSON.parse(raw) as {
  schema: string;
  version: string;
  labels: Record<string, string>;
  wallets: Array<Record<string, string>>;
};
const cfg = JSON.parse(
  readFileSync(join(ROOT, 'config/autopilot/internal-wallets.json'), 'utf-8'),
) as Array<{ address: string; label: string; source: string }>;

describe('static/policy/test-wallets.json', () => {
  it('lists the same (address, label) pairs as internal-wallets.json, in the same order', () => {
    expect(pub.wallets.map((w) => [w.address, w.label])).toEqual(
      cfg.map((w) => [w.address, w.label]),
    );
  });

  it('has the schema, a version, and a described label for every label used', () => {
    expect(pub.schema).toBe('apibase-test-wallets/1');
    expect(pub.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    for (const w of pub.wallets) expect(typeof pub.labels[w.label]).toBe('string');
  });

  it('wallet objects carry only address, label and listed_since, and the date is in the config source', () => {
    pub.wallets.forEach((w, i) => {
      expect(Object.keys(w).sort()).toEqual(['address', 'label', 'listed_since']);
      expect(w.listed_since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(cfg[i].source).toContain(w.listed_since);
    });
  });

  it('is ASCII and does not leak internal wording', () => {
    expect(/^[\x00-\x7f]*$/.test(raw)).toBe(true);
    for (const s of ['source', 'operator file', 'ruling']) expect(raw).not.toContain(s);
  });

  it('nginx serves it with a short cache', () => {
    const conf = readFileSync(join(ROOT, 'nginx/nginx.conf'), 'utf-8');
    const m = /location = \/policy\/test-wallets\.json \{([^}]*)\}/.exec(conf);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('Cache-Control "public, max-age=60"');
    expect(m![1]).toContain('/policy/test-wallets.json');
  });
});
