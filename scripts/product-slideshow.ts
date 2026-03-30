/**
 * APIbase Product Slideshow Generator
 *
 * Takes screenshots of key APIbase pages and compiles into MP4.
 * No login needed — all pages are public.
 *
 * Usage: npx playwright install chromium && npx tsx scripts/product-slideshow.ts
 *
 * Output: /tmp/slideshow/ → 7 PNGs + product-demo.mp4
 */

import { chromium, type Page, type Browser } from 'playwright';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = '/tmp/slideshow';
const VIEWPORT = { width: 1440, height: 900 };

interface SlideSpec {
  index: number;
  url: string;
  name: string;
  duration: number;
  scrollTo?: string;
  waitFor?: string;
  preScript?: (page: Page) => Promise<void>;
}

const TEMPLATE_DIR = path.join(__dirname, '..', 'static', 'video', 'templates');

const SLIDES: SlideSpec[] = [
  // 1. Homepage hero
  {
    index: 1,
    url: 'https://apibase.pro/',
    name: 'homepage-hero',
    duration: 6,
    waitFor: '.sys-monitor',
    preScript: async (p: Page) => {
      await p.waitForTimeout(2000);
    },
  },
  // 2. Connect in 30 seconds (HTML template)
  { index: 2, url: `file://${TEMPLATE_DIR}/slide_connect.html`, name: 'connect', duration: 10 },
  // 3. discover_tools (HTML template)
  { index: 3, url: `file://${TEMPLATE_DIR}/slide_discover.html`, name: 'discover', duration: 10 },
  // 4. Categories table (HTML template)
  {
    index: 4,
    url: `file://${TEMPLATE_DIR}/slide_categories.html`,
    name: 'categories',
    duration: 8,
  },
  // 5. 13-Stage Pipeline (HTML template)
  { index: 5, url: `file://${TEMPLATE_DIR}/slide_pipeline.html`, name: 'pipeline', duration: 10 },
  // 6. Dual-Rail Payments (HTML template)
  { index: 6, url: `file://${TEMPLATE_DIR}/slide_payment.html`, name: 'payment', duration: 10 },
  // 7. Dashboard
  {
    index: 7,
    url: 'https://apibase.pro/dashboard',
    name: 'dashboard',
    duration: 8,
    preScript: async (p: Page) => {
      await p.waitForTimeout(3000);
    },
  },
  // 8. Features
  {
    index: 8,
    url: 'https://apibase.pro/',
    name: 'features',
    duration: 10,
    preScript: async (p: Page) => {
      await p.evaluate(() => {
        document.querySelectorAll('h2').forEach((h) => {
          if (h.textContent?.includes('Why people choose'))
            h.scrollIntoView({ behavior: 'instant', block: 'start' });
        });
      });
      await p.waitForTimeout(500);
    },
  },
  // 9. Usage Analytics (HTML template)
  { index: 9, url: `file://${TEMPLATE_DIR}/slide_analytics.html`, name: 'analytics', duration: 8 },
  // 10. GitHub
  {
    index: 10,
    url: 'https://github.com/whiteknightonhorse/APIbase',
    name: 'github',
    duration: 8,
    preScript: async (p: Page) => {
      await p.waitForTimeout(2000);
    },
  },
  // 11. Smithery
  {
    index: 11,
    url: 'https://smithery.ai/servers/apibase-pro/api-hub',
    name: 'smithery',
    duration: 8,
    preScript: async (p: Page) => {
      await p.waitForTimeout(3000);
    },
  },
  // 12. Comparison
  {
    index: 12,
    url: 'https://apibase.pro/',
    name: 'comparison',
    duration: 10,
    preScript: async (p: Page) => {
      await p.evaluate(() => {
        document.querySelectorAll('h2').forEach((h) => {
          if (h.textContent?.includes('alternatives'))
            h.scrollIntoView({ behavior: 'instant', block: 'start' });
        });
      });
      await p.waitForTimeout(500);
    },
  },
];

async function takeSlide(page: Page, slide: SlideSpec): Promise<string> {
  const filename = `slide_${String(slide.index).padStart(2, '0')}_${slide.name}.png`;
  const filepath = path.join(OUTPUT_DIR, filename);

  console.log(`  Slide ${slide.index}: ${slide.url} → ${slide.name}`);

  await page.goto(slide.url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {
    console.log(`    Warning: networkidle timeout, continuing...`);
  });

  if (slide.waitFor) {
    await page.waitForSelector(slide.waitFor, { state: 'visible', timeout: 10_000 }).catch(() => {
      console.warn(`    Warning: ${slide.waitFor} not visible`);
    });
  }

  if (slide.preScript) {
    await slide.preScript(page);
  }

  await page.screenshot({ path: filepath, type: 'png' });
  console.log(`    Saved: ${filename}`);
  return filepath;
}

function compileToMp4(pngDir: string): string {
  const output = path.join(pngDir, 'product-demo.mp4');
  const filelistPath = path.join(pngDir, 'filelist.txt');

  const lines: string[] = [];
  for (const slide of SLIDES) {
    const filename = `slide_${String(slide.index).padStart(2, '0')}_${slide.name}.png`;
    lines.push(`file '${filename}'`);
    lines.push(`duration ${slide.duration}`);
  }
  // FFmpeg concat requires last file repeated
  const lastName = `slide_${String(SLIDES[SLIDES.length - 1].index).padStart(2, '0')}_${SLIDES[SLIDES.length - 1].name}.png`;
  lines.push(`file '${lastName}'`);
  fs.writeFileSync(filelistPath, lines.join('\n') + '\n');

  const cmd = [
    'ffmpeg',
    '-y',
    `-f concat -safe 0 -i "${filelistPath}"`,
    `-vf "scale=1440:-2:flags=lanczos,format=yuv420p"`,
    `-c:v libx264 -preset slow -crf 20`,
    `-pix_fmt yuv420p -movflags +faststart`,
    `"${output}"`,
  ].join(' ');

  console.log(`\nCompiling MP4...\n  ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit' });

  const stats = fs.statSync(output);
  console.log(`\nMP4 created: ${output} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
  return output;
}

async function main() {
  console.log('=== APIbase Product Slideshow Generator ===\n');

  // Clean output directory
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUTPUT_DIR)) {
    if (f.startsWith('slide_') || f === 'product-demo.mp4' || f === 'filelist.txt') {
      fs.unlinkSync(path.join(OUTPUT_DIR, f));
    }
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();

    for (const slide of SLIDES) {
      await takeSlide(page, slide);
    }

    await ctx.close();
    compileToMp4(OUTPUT_DIR);

    console.log('\n=== Done! ===');
    console.log(`Slides: ${OUTPUT_DIR}/slide_*.png`);
    console.log(`Video:  ${OUTPUT_DIR}/product-demo.mp4`);
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
