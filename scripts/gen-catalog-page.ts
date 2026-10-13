// gen-catalog-page.ts — regenerates static/catalog.html wholesale from live DB truth.
//
// Same reasoning as gen-card.ts (server-card.json): a hand-authored provider list would drift
// the moment onboarding adds/removes a provider. This script queries the exact same filter the
// live catalog routes serve (status != 'unavailable' — src/services/tool-registry.service.ts)
// and rewrites the whole file every run, so it can never disagree with /api/v1/tools or the
// synced tool/provider counts. Called from sync-counts.sh alongside gen-card.ts.
//
// T-75 (2026-09-03): a mobile-overflow fix (T-60) was patched directly into the committed
// static/catalog.html (`.scroll{...overflow-x:auto}`) but never into THIS file, which is what
// actually produces that file. Every regen (cron, self-heal) silently reverted the fix -- the
// generated output stayed byte-for-byte "correct" per this script, while the shipped page lost
// an accessibility fix nobody would notice failing (no test reads the artifact's CSS against
// the fix; check-no-clipped-overflow.py only ever saw whatever was currently committed). Root
// cause of the bug class: a hand-fix landing in the PRODUCER's output instead of the PRODUCER.
// Fixed here (.scroll now carries overflow-x:auto, matching index.html/pricing.html/
// dashboard.html's own .table-wrap pattern) and closed structurally: `renderPage()` below is
// now reachable via `--print`/`--dry-run` with zero DB dependency, so CI can run the actual
// generator (not just eyeball its last output) through check-no-clipped-overflow.py on every
// commit -- see .github/workflows/security.yml's static-no-clipped-overflow job.
import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';

// T-0367: the site header is config/site-nav.{html,css}, shared with every static page (scripts/site-nav.py).
const NAV_HTML = `<!--site-nav-->\n${readFileSync(resolve(__dirname, '../config/site-nav.html'), 'utf8').trim()}\n<!--/site-nav-->`;
const SITE_FOOTER = readFileSync(resolve(__dirname, '../config/page-footer.html'), 'utf8').trim();
const NAV_CSS = `/*site-nav*/\n${readFileSync(resolve(__dirname, '../config/site-nav.css'), 'utf8').trim()}\n/*/site-nav*/`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderPage(
  providers: { provider: string; tools: number }[],
  // T-05 (2026-09-04, ruling-1): AP-8 demotes providers continuously between regens now, so
  // "actually serve right now" is only ever true at the instant this ran. Defaults to today
  // (UTC) so callers that don't pass one (existing tests, manual runs) still get a real date.
  generatedAt: string = new Date().toISOString().slice(0, 10),
): string {
  const totalTools = providers.reduce((sum, p) => sum + p.tools, 0);
  const totalProviders = providers.length;

  const tableRows = providers
    .map((p) => `<tr><td>${escapeHtml(p.provider)}</td><td>${p.tools}</td></tr>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Catalog — APIbase.pro</title>
<meta property="og:image" content="https://apibase.pro/og-image.png?v=20260928">
<meta name="twitter:card" content="summary_large_image">
<meta name="description" content="Every live provider behind APIbase's MCP gateway — ${totalTools} tools across ${totalProviders} providers, generated straight from the production database.">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="shortcut icon" href="/favicon.png">
<link rel="canonical" href="https://apibase.pro/catalog">
<meta property="og:title" content="Catalog — APIbase.pro">
<meta property="og:description" content="${totalTools} tools across ${totalProviders} providers, live — the full list, generated from the production database.">
<meta property="og:url" content="https://apibase.pro/catalog">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Seravek,'Gill Sans Nova',Ubuntu,Calibri,'DejaVu Sans',source-sans-pro,sans-serif;background:#0e100f;color:#b7beb8;line-height:1.7}

.container{padding:1.8rem 2rem 2rem;position:relative;z-index:1}
${NAV_CSS}
h1{color:#4fd283;font-size:1.3rem;margin-bottom:0.5rem;line-height:1.5}

h2{color:#4fd283;font-size:1.05rem;margin:2rem 0 0.8rem;padding-left:1rem;border-left:2px solid #4fd283}

p{margin-bottom:0.8rem;font-size:1rem;color:#b7beb8}
strong{color:#4fd283}
.updated{color:#9ca59e;font-size:0.82rem;margin-bottom:1.8rem}
a{color:#eef1ed;text-decoration:none}
a:hover{color:#4fd283}
table{width:100%;border-collapse:collapse;margin:0.8rem 0 1.4rem;font-size:0.83rem}
th, td{text-align:left;padding:0.4rem 0.7rem;border-bottom:1px solid #272c29}
th{color:#4fd283;font-weight:700;border-bottom:1px solid #4fd283;position:sticky;top:0;background:#0e100f}
td{color:#b7beb8}
td:last-child, th:last-child{text-align:right}
.scroll{max-height:60vh;overflow-y:auto;overflow-x:auto;border:1px solid #272c29;border-radius:6px}
.note{color:#9ca59e;font-size:0.82rem;font-style:italic}
.footer{margin-top:2rem;padding:0.6rem 0;border-top:1px solid #272c29;color:#9ca59e;font-size:0.72rem;display:flex;flex-direction:column;gap:0.2rem}
.footer-row{display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem}
.footer .online{color:#9ca59e}
*::-webkit-scrollbar{width:8px;height:8px}
*::-webkit-scrollbar-track{background:#0e100f;border:1px solid #272c29}
*::-webkit-scrollbar-thumb{background:#1b1f1c;border-radius:4px;border:1px solid #0e100f}
*{scrollbar-width:thin;scrollbar-color:#3e4541 #0e100f}
@media(max-width:600px){.container{padding:1rem}h1{font-size:1.05rem}.footer{font-size:0.65rem}}
</style>
</head>
<body>
${NAV_HTML}
<div class="page-shell">
<div class="container" id="main-content">

<h1>Catalog</h1>
<p class="updated">Generated straight from the production database — never hand-edited, never rounded.</p>

<h2>Every live provider</h2>
<p><strong>${totalTools} tools</strong> across <strong>${totalProviders} providers</strong>, sorted by tool count. This is not a marketing figure &mdash; it is what <a href="/api/v1/tools">/api/v1/tools</a> and the MCP <code>tools/list</code> served as of ${generatedAt} UTC, regenerated when provider availability changes and daily at 05:00 UTC.</p>
<div class="scroll">
<table>
<thead><tr><th>Provider</th><th>Tools</th></tr></thead>
<tbody>
${tableRows}
</tbody>
</table>
</div>
<p class="note">Machine-readable: <a href="/api/tools">/api/tools</a> (public, no auth, cached 1h) or the full paginated <a href="/api/v1/tools">/api/v1/tools</a> (filter by <code>?tier=</code> or <code>?max_price=</code>). Per-tool schemas and pricing: <a href="/pricing">/pricing</a>.</p>

<h2>Shops</h2>
<p>Merchants who sell through APIbase to AI agents: <a href="/shops">/shops</a> lists every active shop; each one has a public page, <code>agent.json</code> and <code>llms.txt</code> under <code>/m/&lt;slug&gt;</code>.</p>

<div class="footer">
<div class="footer-row">
<span><span class="online">STATUS: ONLINE</span>  |  PID: 1337  |  TTY: pts/0  |  USER: apibase</span>
</div>
<div class="footer-row">
<span>${totalTools} tools  |  ${totalProviders} providers  |  x402 USDC on Base + MPP USDC on Tempo</span>
<span>BUILD: v1.0.0</span>
</div>
</div>

</div>
</div>
${SITE_FOOTER}
</body>
</html>
`;
}

// --print / --dry-run: render with fixture data and write to stdout, no Postgres touched at
// all (PrismaClient isn't even constructed). Lets CI validate the TEMPLATE itself -- the thing
// that actually determines what ships -- without DB/SSH access, same shape as gen-sitemap.sh's
// own --print flag. One fixture row is enough: the structural checks this feeds
// (check-no-clipped-overflow.py) only care about the CSS/markup shape, not the data.
// `@prisma/client` is imported dynamically below, only on the non-dry-run path -- a top-level
// import would need `prisma generate` to have run first (CI's own `npm ci --ignore-scripts`
// for this exact job class deliberately skips that), which would defeat the whole point of a
// DB-free dry run.
const DRY_RUN = process.argv.includes('--print') || process.argv.includes('--dry-run');

// T-05 (2026-09-04, ruling-1): same reasoning as gen-card.ts's readActiveToolIds() -- when
// sync-counts.sh's self-heal sets SYNC_COUNTS_SNAPSHOT, group straight from that frozen
// `tool_id<TAB>provider` dump instead of running a second, separately-timed live query that
// could see a different slice of `tools` if AP-8 wrote in between. Unset (manual/ad-hoc runs)
// falls back to the live groupBy query below, unchanged.
function readSnapshotProviders(): { provider: string; tools: number }[] | null {
  const snapshotPath = process.env.SYNC_COUNTS_SNAPSHOT;
  if (!snapshotPath) return null;
  const lines = readFileSync(snapshotPath, 'utf8').split('\n').filter(Boolean);
  const counts = new Map<string, number>();
  for (const line of lines) {
    const provider = line.split('\t')[1];
    if (!provider) continue;
    counts.set(provider, (counts.get(provider) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([provider, tools]) => ({ provider, tools }))
    .sort((a, b) => b.tools - a.tools || a.provider.localeCompare(b.provider));
}

async function main() {
  if (DRY_RUN) {
    process.stdout.write(renderPage([{ provider: 'fixture-provider', tools: 1 }]));
    return;
  }

  const snapshotProviders = readSnapshotProviders();
  if (snapshotProviders) {
    if (snapshotProviders.length === 0) {
      throw new Error(
        'gen-catalog-page: zero active providers in SYNC_COUNTS_SNAPSHOT — refusing to publish an empty catalog',
      );
    }
    const totalTools = snapshotProviders.reduce((sum, p) => sum + p.tools, 0);
    writeFileSync('static/catalog.html', renderPage(snapshotProviders));
    console.log(
      `gen-catalog-page: wrote static/catalog.html from SYNC_COUNTS_SNAPSHOT (${totalTools} tools / ${snapshotProviders.length} providers)`,
    );
    return;
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.tool.groupBy({
      by: ['provider'],
      where: { status: { not: 'unavailable' } },
      _count: { _all: true },
    });

    if (rows.length === 0) {
      throw new Error(
        'gen-catalog-page: zero active providers — refusing to publish an empty catalog',
      );
    }

    const providers = rows
      .map((r) => ({ provider: r.provider, tools: r._count._all }))
      .sort((a, b) => b.tools - a.tools || a.provider.localeCompare(b.provider));

    const totalTools = providers.reduce((sum, p) => sum + p.tools, 0);
    const totalProviders = providers.length;

    writeFileSync('static/catalog.html', renderPage(providers));
    console.log(
      `gen-catalog-page: wrote static/catalog.html (${totalTools} tools / ${totalProviders} providers)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('gen-catalog-page failed:', err);
  process.exitCode = 1;
});
