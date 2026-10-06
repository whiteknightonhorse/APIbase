/**
 * T-INT-20 F-18: the "Implementation status" tables of docs/integrator.md match the code. Every row
 * marked `yes` must exist (tool registered, route mounted); every row marked `no` must not.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG_TOOL_NAMES } from '../../src/shop/tools/catalog.tools';
import { MERCHANT_TOOL_NAMES } from '../../src/shop/tools/merchant.tools';
import { ORDER_TOOL_NAMES } from '../../src/shop/tools/order.tools';

jest.mock('../../src/config/index', () => ({ config: { ENCRYPTION_KEY: 'k'.repeat(40) } }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const doc = read('docs/integrator.md');
const status = doc.slice(
  doc.indexOf('## Implementation status'),
  doc.indexOf('## Demo merchant seed'),
);

const rows = [...status.matchAll(/^\| `([^`]+)`\s*\| (yes|no)\s*\|/gm)].map((m) => ({
  item: m[1],
  yes: m[2] === 'yes',
}));

const routerSrc = ['merchant', 'order', 'storefront', 'check']
  .map((n) => read(`src/shop/routes/${n}.router.ts`))
  .join('\n');
const implementedTools = new Set<string>([
  ...CATALOG_TOOL_NAMES,
  ...MERCHANT_TOOL_NAMES,
  ...ORDER_TOOL_NAMES,
]);

/** `/api/v1/shop/<path>` as mounted in the routers (the :param names are not compared). */
function routeMounted(item: string): boolean {
  const [method, path] = item.split(' ');
  const full = `/api/v1/shop${path}`.replace(/:[a-z_]+/g, ':p');
  const re = new RegExp(`router\\.${method.toLowerCase()}\\(\\s*['"]([^'"]+)['"]`, 'g');
  for (const m of routerSrc.matchAll(re)) {
    if (m[1].replace(/:[a-z_]+/g, ':p') === full) return true;
  }
  return false;
}

describe('docs/integrator.md implementation status (F-18)', () => {
  it('has the tables', () => {
    expect(rows.length).toBeGreaterThan(40);
  });
  it.each(rows.filter((r) => r.item.startsWith('shop.')))('tool %#: $item', ({ item, yes }) => {
    expect(implementedTools.has(item)).toBe(yes);
  });
  it.each(rows.filter((r) => /^(GET|POST|PUT) /.test(r.item)))(
    'route %#: $item',
    ({ item, yes }) => {
      expect(routeMounted(item)).toBe(yes);
    },
  );
});
