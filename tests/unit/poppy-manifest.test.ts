/** T-0521: website-only Poppy manifest and honest agent.json labels. No DB. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const text = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('T-0521 poppy.json', () => {
  const j = JSON.parse(text('static/.well-known/poppy.json'));

  it('is a website-only manifest', () => {
    expect(j.protocol_version).toBe('0.1');
    expect(typeof j.organization.name).toBe('string');
    expect(j.organization.domain).toBe('apibase.pro');
    expect(typeof j.web).toBe('object');
    expect(j.web).not.toBeNull();
    for (const k of ['auth', 'agent', 'apis']) expect(j).not.toHaveProperty(k);
  });

  it('contains no digits outside protocol_version', () => {
    const { protocol_version: _v, ...rest } = j;
    expect(JSON.stringify(rest)).not.toMatch(/\d/);
  });

  it('is served by the /.well-known/ block as application/json', () => {
    expect(text('nginx/nginx.conf')).toMatch(
      /location \/\.well-known\/ \{\s*root \/var\/www\/static;\s*add_header Content-Type application\/json;/,
    );
  });

  it('is listed in api-catalog', () => {
    expect(text('static/.well-known/api-catalog')).toContain(
      'https://apibase.pro/.well-known/poppy.json',
    );
  });
});

describe('T-0521 agent.json labels', () => {
  it.each(['static/.well-known/api-catalog', 'static/robots.txt', 'static/index.md'])(
    '%s does not call agent.json an A2A Agent Card',
    (p) => {
      expect(text(p)).not.toMatch(/A2A Agent Card(?!\))|Agent Card \(A2A\)/);
    },
  );
});
