// T-0227 (B1) — deterministic pixel edit of og-cover-2026-09-28.png
// Line "1,384 tools · 396 providers · Ready." -> only "Ready." remains,
// moved to the line's left margin (same x as "MCP connected:"); the rest
// of the line's bbox is filled with the sampled flat background color.
//
// Coordinates were derived by scanning pixel brightness in the source PNG
// (see /home/apibase/taskloop/logs/0227-og-cover-nocounts-asset/*.log):
//   - line bbox (the whole "1,384 tools..." line, incl. antialiased edges):
//       x:[135,741] y:[347,374]  (607 x 28)
//   - "Ready." glyph-only bbox within that line: x:[648,741] y:[347,374] (94 x 28)
//   - left margin x (same column as "MCP connected:" line start): x=135
//
// Uses pngjs (pure-JS PNG codec, no native binary) borrowed read-only from
// an already-installed local node_modules dir (no network fetch, no npm
// install) since Pillow/ImageMagick are not present on this host.

const { PNG } = require('/opt/aipush/webapp/node_modules/pngjs');
const fs = require('fs');

const SRC = '/home/apibase/taskloop/briefs/og-cover-2026-09-28.png';
const OUT = '/home/apibase/taskloop/briefs/og-cover-2026-09-28-nocounts.png';

const LINE_BBOX = { x0: 135, y0: 347, x1: 741, y1: 374 }; // inclusive
const READY_BBOX = { x0: 648, y0: 347, x1: 741, y1: 374 }; // inclusive
const DEST_X = 135; // paste "Ready." here, same y (347) — same line, left margin
const DEST_Y = 347;

const png = PNG.sync.read(fs.readFileSync(SRC));
const { width, height, data } = png;

function idx(x, y) { return (width * y + x) * 4; }

// 1. Sample background color: flat interior of the terminal window, same
//    row band as the text line, far from any glyph (x 850..1500).
const samplePoints = [];
for (let x = 850; x <= 1500; x += 25) {
  for (let y = LINE_BBOX.y0; y <= LINE_BBOX.y1; y += 5) {
    samplePoints.push([x, y]);
  }
}
let sr = 0, sg = 0, sb = 0;
let minC = [999, 999, 999], maxC = [-1, -1, -1];
for (const [x, y] of samplePoints) {
  const i = idx(x, y);
  const r = data[i], g = data[i + 1], b = data[i + 2];
  sr += r; sg += g; sb += b;
  minC = [Math.min(minC[0], r), Math.min(minC[1], g), Math.min(minC[2], b)];
  maxC = [Math.max(maxC[0], r), Math.max(maxC[1], g), Math.max(maxC[2], b)];
}
const n = samplePoints.length;
const bg = [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)];
console.log('BG_SAMPLE_N=' + n);
console.log('BG_SAMPLE_MEAN=' + bg.join(','));
console.log('BG_SAMPLE_MIN=' + minC.join(','));
console.log('BG_SAMPLE_MAX=' + maxC.join(','));
console.log('BG_SAMPLE_RANGE=' + [maxC[0]-minC[0], maxC[1]-minC[1], maxC[2]-minC[2]].join(','));

// 2. Extract the "Ready." glyph block from the ORIGINAL data before any mutation.
const rw = READY_BBOX.x1 - READY_BBOX.x0 + 1;
const rh = READY_BBOX.y1 - READY_BBOX.y0 + 1;
const readyBlock = Buffer.alloc(rw * rh * 4);
for (let y = 0; y < rh; y++) {
  for (let x = 0; x < rw; x++) {
    const srcI = idx(READY_BBOX.x0 + x, READY_BBOX.y0 + y);
    const dstI = (y * rw + x) * 4;
    data.copy(readyBlock, dstI, srcI, srcI + 4);
  }
}

// 3. Fill the full line bbox with the sampled background color.
for (let y = LINE_BBOX.y0; y <= LINE_BBOX.y1; y++) {
  for (let x = LINE_BBOX.x0; x <= LINE_BBOX.x1; x++) {
    const i = idx(x, y);
    data[i] = bg[0]; data[i + 1] = bg[1]; data[i + 2] = bg[2]; data[i + 3] = 255;
  }
}

// 4. Paste the "Ready." block at the left margin, same row.
for (let y = 0; y < rh; y++) {
  for (let x = 0; x < rw; x++) {
    const dstI = idx(DEST_X + x, DEST_Y + y);
    const srcI = (y * rw + x) * 4;
    data[dstI] = readyBlock[srcI];
    data[dstI + 1] = readyBlock[srcI + 1];
    data[dstI + 2] = readyBlock[srcI + 2];
    data[dstI + 3] = readyBlock[srcI + 3];
  }
}

fs.writeFileSync(OUT, PNG.sync.write(png));
console.log('OUT_WRITTEN=' + OUT);
console.log('OUT_DIMS=' + width + 'x' + height);
console.log('EDIT_BBOX=' + JSON.stringify(LINE_BBOX));
console.log('READY_SRC_BBOX=' + JSON.stringify(READY_BBOX));
console.log('READY_DEST=' + JSON.stringify({ x0: DEST_X, y0: DEST_Y, x1: DEST_X + rw - 1, y1: DEST_Y + rh - 1 }));
