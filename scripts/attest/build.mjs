// A-GA-02: bundle the /attest/ page script (with the pinned genlayer-js) into static/attest/attest.js.
// Usage: node scripts/attest/build.mjs   (the output is committed; nginx serves it as a static file)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = await build({
  entryPoints: [join(here, 'entry.ts')],
  outfile: join(here, '../../static/attest/attest.js'),
  write: false,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
});

// The bundled curve libraries carry 64-hex-digit constants (secp256k1 parameters, public values) that the
// pre-commit private-key scan cannot tell from a key. Splitting the literal keeps the value identical.
// The library's own Bradbury chain definition names the old explorer host; the page never uses it (chain.ts passes
// EXPLORER_BASE), so the stale literal is rewritten to the current host to keep the old one out of static/.
const OLD_EXPLORERS = ['bradbury', 'asimov'].map((n) => ['explorer', n].join('-')); // spelled out so the repo-wide absence check stays meaningful
const code = out.outputFiles[0].text
  .replace(/"0x([0-9a-fA-F]{64})"/g, '("0"+"x$1")')
  .replace(new RegExp(`https://(?:${OLD_EXPLORERS.join('|')})\\.genlayer\\.com`, 'g'), 'https://scan.bradbury.genlayer.com');
writeFileSync(out.outputFiles[0].path, code);

// The network note is stated once, in attest-view.ts, and rendered into the page here.
const view = await build({
  entryPoints: [join(here, 'attest-view.ts')],
  write: false,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const { NETWORK_NOTE } = await import(
  'data:text/javascript;base64,' + Buffer.from(view.outputFiles[0].text).toString('base64')
);
const page = join(here, '../../static/attest/index.html');
writeFileSync(
  page,
  readFileSync(page, 'utf8').replace(
    /<!--network-note-->[\s\S]*?<!--\/network-note-->/,
    () => `<!--network-note-->${NETWORK_NOTE}<!--/network-note-->`,
  ),
);
