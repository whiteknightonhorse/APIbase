/** T-0572: access-log credential masking. Applies the chained nginx map stages (parsed from the conf) as JS regexes. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');

function stages(file: string): Array<{ re: RegExp; tpl: string }> {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const out: Array<{ re: RegExp; tpl: string }> = [];
  for (const m of src.matchAll(/^\s*"~(\^.*\$)" "([^"]+)";$/gm))
    out.push({ re: new RegExp(m[1]), tpl: m[2] });
  return out;
}

function mask(uri: string, st: Array<{ re: RegExp; tpl: string }>): string {
  let cur = uri;
  for (const { re, tpl } of st) {
    const m = re.exec(cur);
    if (m) cur = tpl.replace(/\$(\w+)/g, (_, n: string) => m.groups?.[n] ?? '');
  }
  return cur;
}

describe.each(['nginx/nginx.conf', 'nginx/apibase-host.conf'])('T-0572 log mask in %s', (file) => {
  const st = stages(file);
  it('has four chained stages', () => expect(st).toHaveLength(4));
  it.each([
    ['/api/v1/tools?api_key=0b1c-22&limit=5', '/api/v1/tools?api_key=REDACTED&limit=5'],
    [
      '/x?q=1&token=t1&key=k2&api_key=a3&access_token=z',
      '/x?q=1&token=REDACTED&key=REDACTED&api_key=REDACTED&access_token=REDACTED',
    ],
    ['/x?a=1&key=', '/x?a=1&key=REDACTED'],
    ['/x?monkey=1&mykey=2&keys=3', '/x?monkey=1&mykey=2&keys=3'],
    ['/x?q=api_key=1', '/x?q=api_key=1'],
    ['/plain/path', '/plain/path'],
  ])('%s', (input, expected) => expect(mask(input, st)).toBe(expected));
});

it('container log line uses the masked URI, not raw $request', () => {
  const conf = readFileSync(join(ROOT, 'nginx/nginx.conf'), 'utf8');
  expect(conf).toContain('$request_method $request_uri_masked $server_protocol');
  expect(conf).not.toMatch(/"\$request"/);
});
