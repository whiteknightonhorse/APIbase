/** Regenerates the country block of static/legal/aup.md from config/integrator/countries-restricted.json (never by hand). */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const countries: string[] = JSON.parse(
  readFileSync(resolve(root, 'config/integrator/countries-restricted.json'), 'utf-8'),
).restricted_entity_countries;
const file = resolve(root, 'static/legal/aup.md');
const block = `<!-- countries:start -->\n${countries.join(', ')}\n<!-- countries:end -->`;
writeFileSync(
  file,
  readFileSync(file, 'utf-8').replace(
    /<!-- countries:start -->[\s\S]*?<!-- countries:end -->/,
    block,
  ),
);
