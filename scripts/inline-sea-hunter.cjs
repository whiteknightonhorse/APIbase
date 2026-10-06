#!/usr/bin/env node
// T-INT-30: minify static/js/sea-hunter.js and inline it into static/index.html between the
// <!--sea-js--> markers. `--check` exits 1 if the inlined copy differs from a fresh build.
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'static/index.html');
const src = fs.readFileSync(path.join(root, 'static/js/sea-hunter.js'), 'utf8');
const min = transformSync(src, { minify: true, target: 'es2017' }).code.trim();
const html = fs.readFileSync(htmlPath, 'utf8');
const re = /<!--sea-js--><script>[\s\S]*?<\/script><!--\/sea-js-->/;
if (!re.test(html)) throw new Error('sea-js markers not found in static/index.html');
const out = html.replace(re, () => `<!--sea-js--><script>${min}</script><!--/sea-js-->`);
if (process.argv.includes('--check')) process.exit(out === html ? 0 : 1);
fs.writeFileSync(htmlPath, out);
console.log(`inlined ${Buffer.byteLength(min)} bytes`);
