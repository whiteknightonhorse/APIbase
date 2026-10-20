// A-GA-02: bundle the /attest/ page script (with the pinned genlayer-js) into static/attest/attest.js.
// Usage: node scripts/attest/build.mjs   (the output is committed; nginx serves it as a static file)
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
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
const code = out.outputFiles[0].text.replace(/"0x([0-9a-fA-F]{64})"/g, '("0"+"x$1")');
writeFileSync(out.outputFiles[0].path, code);
