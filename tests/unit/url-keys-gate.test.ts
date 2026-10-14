/**
 * T-0400c: no literal credentials in URL query strings of tracked config, and
 * `${VAR}` placeholders are substituted from env for health probes.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  findLiteralUrlCredentials,
  maskUrlCredentials,
  substituteEnvPlaceholders,
} from '../../src/config/url-keys';

const ROOT = join(__dirname, '..', '..');

function trackedConfigFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--', 'src/config', 'config'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.split('\n').filter((f) => /\.(json|ya?ml)$/.test(f));
}

describe('URL credential gate', () => {
  it('fires on a planted literal key', () => {
    expect(
      findLiteralUrlCredentials('"health_url": "https://x.example/v1?api_key=abcdef1234567890"'),
    ).toEqual(['api_key']);
    expect(findLiteralUrlCredentials('https://x.example/?a=1&wskey=abc12345&token=zzz')).toEqual([
      'wskey',
      'token',
    ]);
    expect(findLiteralUrlCredentials('https://x.example/?key=test')).toEqual(['key']);
  });

  it('passes on placeholders and unrelated parameters', () => {
    expect(findLiteralUrlCredentials('https://x.example/?api_key=${PROVIDER_KEY_FOO}&q=1')).toEqual(
      [],
    );
    expect(
      findLiteralUrlCredentials('https://x.example/?monkey=1&keyword=abc&email=a@b.c'),
    ).toEqual([]);
  });

  it('tracked config JSON/YAML has no literal credential query parameters', () => {
    const offenders: string[] = [];
    for (const f of trackedConfigFiles()) {
      const hits = findLiteralUrlCredentials(readFileSync(join(ROOT, f), 'utf8'));
      if (hits.length) offenders.push(`${f}: ${hits.join(',')}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('health URL substitution', () => {
  it('substitutes ${VAR} from env and blanks unset vars', () => {
    const url = 'https://x.example/v2?api_key=${PROVIDER_KEY_FOO}&k2=${PROVIDER_KEY_MISSING}';
    expect(substituteEnvPlaceholders(url, { PROVIDER_KEY_FOO: 'VALUE123' })).toBe(
      'https://x.example/v2?api_key=VALUE123&k2=',
    );
  });

  it('masks credential values for logging', () => {
    expect(maskUrlCredentials('https://x.example/?a=1&api_key=VALUE123&q=2')).toBe(
      'https://x.example/?a=1&api_key=***&q=2',
    );
  });
});
