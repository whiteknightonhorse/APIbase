import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface CategoriesFile {
  allowed: string[];
  prohibited: Array<{ slug: string; text: string }>;
}

const FILE = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../config/integrator/prohibited-categories.json'),
    'utf-8',
  ),
) as CategoriesFile;

export const ALLOWED_CATEGORIES: readonly string[] = FILE.allowed;

/** F-13 layer 1: only what is listed in `allowed` passes. */
export function isCategoryAllowed(category: string): boolean {
  return ALLOWED_CATEGORIES.includes(category);
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...new Array<number>(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[a.length][b.length];
}

/** The `n` allowed slugs closest (edit distance) to a refused one. */
export function nearestAllowed(category: string, n = 3): string[] {
  return ALLOWED_CATEGORIES.map((slug, i) => ({ slug, i, d: distance(category, slug) }))
    .sort((x, y) => x.d - y.d || x.i - y.i)
    .slice(0, n)
    .map((x) => x.slug);
}
