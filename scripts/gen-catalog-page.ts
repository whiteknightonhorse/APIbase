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
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';

// T-0367: the site header is config/site-nav.{html,css}, shared with every static page (scripts/site-nav.py).
const NAV_HTML = `<!--site-nav-->\n${readFileSync(resolve(__dirname, '../config/site-nav.html'), 'utf8').trim()}\n<!--/site-nav-->`;
const SITE_FOOTER = readFileSync(resolve(__dirname, '../config/page-footer.html'), 'utf8').trim();
const NAV_CSS = `/*site-nav*/\n${readFileSync(resolve(__dirname, '../config/site-nav.css'), 'utf8').trim()}\n/*/site-nav*/`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface CatalogProvider {
  provider: string;
  tools: number;
  /** Lowest and highest per-call price in USD over this provider's tools. */
  minPrice: number;
  maxPrice: number;
  /** Raw TOOL_DEFINITIONS category (most common among the provider's tools). */
  category: string;
}

/** "travel" -> "Travel", "real_estate" -> "Real estate". */
export function categoryLabel(c: string): string {
  const t = c.replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function usd(x: number): string {
  let s = x.toFixed(6).replace(/0+$/, '');
  const dec = s.length - s.indexOf('.') - 1;
  if (dec < 2) s += '0'.repeat(2 - dec);
  return `$${s}`;
}

export function priceText(min: number, max: number): string {
  if (max <= 0) return 'Free';
  return min === max ? usd(min) : `${usd(min)} up to ${usd(max)}`;
}

/** Groups `tool_id<TAB>provider<TAB>price_usd` rows into one entry per provider, sorted by tool count. */
export function groupProviders(
  rows: { toolId: string; provider: string; price: number }[],
  categoryOf: Map<string, string>,
): CatalogProvider[] {
  const by = new Map<string, { n: number; min: number; max: number; cats: Map<string, number> }>();
  for (const r of rows) {
    let e = by.get(r.provider);
    if (!e) {
      e = { n: 0, min: Infinity, max: 0, cats: new Map() };
      by.set(r.provider, e);
    }
    e.n += 1;
    e.min = Math.min(e.min, r.price);
    e.max = Math.max(e.max, r.price);
    const c = categoryOf.get(r.toolId) ?? 'other';
    e.cats.set(c, (e.cats.get(c) ?? 0) + 1);
  }
  return [...by.entries()]
    .map(([provider, e]) => ({
      provider,
      tools: e.n,
      minPrice: e.min,
      maxPrice: e.max,
      category: [...e.cats.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    }))
    .sort((a, b) => b.tools - a.tools || a.provider.localeCompare(b.provider));
}

const FILTER_JS = `(function(){
var g=document.getElementById("cat-grid");if(!g)return;
var cards=[].slice.call(g.children),q=document.getElementById("cat-q"),sort=document.getElementById("cat-sort"),
chips=[].slice.call(document.querySelectorAll("#cat-chips button")),count=document.getElementById("cat-count"),
empty=document.getElementById("cat-empty"),emptyQ=document.getElementById("cat-empty-q"),clear=document.getElementById("cat-clear"),
cat="",total=cards.length;
document.getElementById("cat-controls").hidden=false;
function run(){
var t=q.value.trim().toLowerCase(),shown=0,order=cards.slice();
var s=sort.value;
order.sort(function(a,b){
if(s==="tools")return b.dataset.tools-a.dataset.tools||a.dataset.name.localeCompare(b.dataset.name);
if(s==="price")return a.dataset.min-b.dataset.min||a.dataset.name.localeCompare(b.dataset.name);
return a.dataset.name.localeCompare(b.dataset.name);});
order.forEach(function(c){g.appendChild(c);
var ok=(!cat||c.dataset.cat===cat)&&(!t||c.dataset.name.indexOf(t)>-1||c.dataset.label.toLowerCase().indexOf(t)>-1);
c.hidden=!ok;if(ok)shown++;});
count.textContent="Showing "+shown+" of "+total+" providers";
empty.hidden=shown>0;emptyQ.textContent=t?'"'+q.value.trim()+'"':"this filter";}
q.addEventListener("input",run);sort.addEventListener("change",run);
chips.forEach(function(b){b.addEventListener("click",function(){cat=b.dataset.cat;
chips.forEach(function(x){x.setAttribute("aria-pressed",x===b?"true":"false");});run();});});
clear.addEventListener("click",function(){q.value="";cat="";chips.forEach(function(x){x.setAttribute("aria-pressed",x.dataset.cat===""?"true":"false");});run();q.focus();});
run();})();`;

const ICON_SEARCH =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M20 20l-4.2-4.2"></path></svg>';
const ICON_ARROW =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';
const ICON_STORE =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5L5.5 4.5h13L20 9.5M4 9.5h16v10H4zM9.5 19.5v-5h5v5"></path></svg>';
const ICON_PLUS =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>';

export function renderPage(
  providers: CatalogProvider[],
  // T-05 (2026-09-04, ruling-1): AP-8 demotes providers continuously between regens now, so
  // "actually serve right now" is only ever true at the instant this ran. Defaults to today
  // (UTC) so callers that don't pass one (existing tests, manual runs) still get a real date.
  generatedAt: string = new Date().toISOString().slice(0, 10),
): string {
  const totalTools = providers.reduce((sum, p) => sum + p.tools, 0);
  const totalProviders = providers.length;

  const cards = providers
    .map((p) => {
      const label = categoryLabel(p.category);
      return `<article class="cat-card" data-name="${escapeHtml(p.provider.toLowerCase())}" data-label="${escapeHtml(label)}" data-cat="${escapeHtml(p.category)}" data-tools="${p.tools}" data-min="${p.minPrice}">
<div class="cat-top"><h3>${escapeHtml(p.provider)}</h3><span class="m-badge" data-status="ok">Live</span></div>
<span class="cat-cat">${escapeHtml(label)}</span>
<div class="cat-foot"><span><b>${p.tools}</b> tools</span><span class="cat-price">${priceText(p.minPrice, p.maxPrice)}</span></div>
</article>`;
    })
    .join('\n');

  const catCounts = new Map<string, number>();
  for (const p of providers) catCounts.set(p.category, (catCounts.get(p.category) ?? 0) + 1);
  const chips = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(
      ([c]) =>
        `<button type="button" data-cat="${escapeHtml(c)}" aria-pressed="false">${escapeHtml(categoryLabel(c))}</button>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MCP tool catalog — ${totalTools} tools, ${totalProviders} providers | APIbase</title>
<meta property="og:image" content="https://apibase.pro/og-image.png?v=20260928">
<meta name="twitter:card" content="summary_large_image">
<meta name="description" content="MCP tool catalog: every live provider behind APIbase's MCP gateway — ${totalTools} tools across ${totalProviders} providers, generated straight from the production database.">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="shortcut icon" href="/favicon.png">
<link rel="canonical" href="https://apibase.pro/catalog">
<meta property="og:title" content="MCP tool catalog — ${totalTools} tools, ${totalProviders} providers | APIbase">
<meta property="og:description" content="MCP tool catalog: every live provider behind APIbase's MCP gateway — ${totalTools} tools across ${totalProviders} providers, generated straight from the production database.">
<meta property="og:url" content="https://apibase.pro/catalog">
<style>
${NAV_CSS}
/* T-75 gate reads inline CSS only: every pre/table scrolls inside its own box (site-m.css styles the rest) */
pre{overflow-x:auto}
.table-wrap,.m-table-wrap,.scroll{overflow-x:auto}
.cat-hero{display:flex;flex-wrap:wrap;gap:var(--s5) var(--s7);align-items:flex-start;margin-bottom:var(--s6)}
.cat-hero-main{flex:999 1 520px;min-width:0}
.cat-hero-main .updated{font-size:var(--fs-lead);color:var(--ink-2);max-width:620px}
.cat-ctas{display:flex;flex-wrap:wrap;gap:var(--s3)}
.cat-stats{flex:1 1 320px;min-width:0;max-width:440px;background:var(--surf);border:1px solid var(--line);border-radius:var(--r-panel);padding:var(--s5);display:grid;grid-template-columns:1fr 1fr;gap:var(--s4)}
.cat-stats div{display:flex;flex-direction:column;gap:6px}
.cat-stats .m-stat{font-size:44px}
.cat-stats span:last-child{color:var(--ink-2);font-size:var(--fs-small)}
.cat-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin:var(--s4) 0}
.cat-controls[hidden],.cat-chips[hidden],.cat-card[hidden],.cat-empty[hidden]{display:none}
.cat-field{display:flex;flex-direction:column;gap:4px}
.cat-field span.m-label{font-size:13px;color:var(--ink-2)}
.cat-field.q{flex:3 1 280px;min-width:0}
.cat-field.s{flex:1 1 180px}
.cat-field .box{position:relative;display:block}
.cat-field .box svg{position:absolute;left:12px;top:14px;color:var(--ink-2)}
.cat-field .box .m-input{padding-left:42px}
.cat-chips{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 var(--s4)}
.cat-chips button{min-height:44px;padding:0 14px;border-radius:var(--r-chip);border:1px solid var(--line-2);background:transparent;color:var(--ink);font:inherit;font-size:15px;cursor:pointer;transition:background var(--t-mid) var(--ease)}
.cat-chips button:hover{background:var(--surf-2)}
.cat-chips button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--on-accent);font-weight:650}
#cat-count{font-size:var(--fs-small);color:var(--ink-2);margin:0 0 var(--s4)}
.cat-empty{border:1px solid var(--line);border-radius:var(--r-card);padding:var(--s5);display:flex;flex-direction:column;gap:10px;align-items:flex-start;margin-bottom:var(--s4)}
.cat-empty strong{font-size:18px;overflow-wrap:anywhere}
.cat-empty p{margin:0}
.cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:12px;margin:0 0 var(--s5)}
.cat-card{background:var(--surf);border:1px solid var(--line);border-radius:var(--r-card);padding:18px;display:flex;flex-direction:column;gap:12px;min-width:0}
.cat-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.cat-top h3{margin:0;font-size:17px;font-weight:600;overflow-wrap:anywhere}
.cat-top .m-badge{white-space:nowrap;flex:none}
.cat-cat{font-size:14px;color:var(--ink-2)}
.cat-foot{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-top:auto;padding-top:10px;border-top:1px solid var(--line);font-size:15px;color:var(--ink-2)}
.cat-foot b{color:var(--ink);font-variant-numeric:tabular-nums}
.cat-price{font-family:var(--mono);font-size:13.5px;color:var(--ink)}
.note{color:var(--ink-3);font-size:var(--fs-small)}
.cat-shops{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px;margin:var(--s4) 0}
.cat-shops a{background:var(--surf);border:1px solid var(--line);border-radius:var(--r-card);padding:18px;display:flex;flex-direction:column;gap:10px;text-decoration:none;color:var(--ink)}
.cat-shops a:hover{border-color:var(--ink-3);color:var(--ink)}
.cat-shops a.add{border-style:dashed;border-color:var(--line-2)}
.cat-shops a.add:hover{border-color:var(--accent)}
.cat-shops strong{font-size:17px}
.cat-shops span{font-size:15px;color:var(--ink-2)}
.cat-foot-line{margin-top:var(--s7);padding-top:var(--s4);border-top:1px solid var(--line);color:var(--ink-3);font-size:var(--fs-small)}
@media(max-width:600px){.cat-stats .m-stat{font-size:36px}}
@media(max-width:1100px){.cat-stats{max-width:none;flex-basis:100%}}
</style>
</head>
<body>
${NAV_HTML}
<div class="page-shell">
<div class="container" id="main-content">

<section class="cat-hero">
<div class="cat-hero-main">
<h1>MCP tool catalog</h1>
<p class="updated">Generated straight from the production database — never hand-edited, never rounded.</p>
<div class="cat-ctas"><a class="m-btn m-btn--primary" href="/connect">Connect your agent ${ICON_ARROW}</a></div>
</div>
<aside class="cat-stats" aria-label="Catalog totals">
<div><span class="m-stat">${totalTools}</span><span>tools</span></div>
<div><span class="m-stat">${totalProviders}</span><span>providers</span></div>
</aside>
</section>

<h2>Every live provider</h2>
<p><strong>${totalTools} tools</strong> across <strong>${totalProviders} providers</strong>, sorted by tool count. This is not a marketing figure &mdash; it is what <a href="/api/v1/tools">/api/v1/tools</a> and the MCP <code>tools/list</code> served as of ${generatedAt} UTC, regenerated when provider availability changes and daily at 05:00 UTC.</p>

<div class="cat-controls" id="cat-controls" hidden>
<label class="cat-field q"><span class="m-label">Search tools and providers</span><span class="box">${ICON_SEARCH}<input class="m-input" id="cat-q" type="search" placeholder="e.g. flight search" autocomplete="off"></span></label>
<label class="cat-field s"><span class="m-label">Sort</span><select class="m-select" id="cat-sort"><option value="tools" selected>Most tools</option><option value="name">Name</option><option value="price">Lowest price</option></select></label>
</div>
<div class="cat-chips" id="cat-chips" role="group" aria-label="Category">
<button type="button" data-cat="" aria-pressed="true">All</button>
${chips}
</div>
<p id="cat-count" aria-live="polite">${totalProviders} providers</p>
<div class="cat-empty" id="cat-empty" hidden>
<strong>No providers match <span id="cat-empty-q"></span></strong>
<p>Check the spelling or browse by category.</p>
<button type="button" class="m-btn" id="cat-clear">Clear search</button>
</div>
<div class="cat-grid" id="cat-grid">
${cards}
</div>
<p class="note">Machine-readable: <a href="/api/tools">/api/tools</a> (public, no auth, cached 1h) or the full paginated <a href="/api/v1/tools">/api/v1/tools</a> (filter by <code>?tier=</code> or <code>?max_price=</code>). Per-tool schemas and pricing: <a href="/pricing">/pricing</a>.</p>

<h2>Shops</h2>
<p>Merchants who sell through APIbase to AI agents: <a href="/shops">/shops</a> lists every active shop; each one has a public page, <code>agent.json</code> and <code>llms.txt</code> under <code>/m/&lt;slug&gt;</code>.</p>
<div class="cat-shops">
<a href="/shops">${ICON_STORE}<strong>All shops</strong><span>Every active shop that sells to AI agents in USDC.</span></a>
<a class="add" href="/integrator">${ICON_PLUS}<strong>Your store here</strong><span>Let AI agents order and pay in USDC.</span></a>
</div>

<p class="cat-foot-line">${totalTools} tools &middot; ${totalProviders} providers &middot; x402 USDC on Base + MPP USDC on Tempo</p>

</div>
</div>
${SITE_FOOTER}
<script>${FILTER_JS}</script>
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
function categoryMap(): Map<string, string> {
  return new Map(TOOL_DEFINITIONS.map((d) => [d.toolId, d.category ?? 'other']));
}

function readSnapshotProviders(): CatalogProvider[] | null {
  const snapshotPath = process.env.SYNC_COUNTS_SNAPSHOT;
  if (!snapshotPath) return null;
  const rows = readFileSync(snapshotPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))
    .filter((f) => f[1])
    .map((f) => ({ toolId: f[0], provider: f[1], price: Number(f[2]) || 0 }));
  return groupProviders(rows, categoryMap());
}

async function main() {
  if (DRY_RUN) {
    process.stdout.write(
      renderPage([
        {
          provider: 'fixture-provider',
          tools: 1,
          minPrice: 0.001,
          maxPrice: 0.002,
          category: 'other',
        },
      ]),
    );
    return;
  }

  let providers = readSnapshotProviders();
  let source = 'SYNC_COUNTS_SNAPSHOT';
  if (!providers) {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const found = await prisma.tool.findMany({
        where: { status: { not: 'unavailable' } },
        select: { tool_id: true, provider: true, price_usd: true },
      });
      providers = groupProviders(
        found.map((r) => ({ toolId: r.tool_id, provider: r.provider, price: Number(r.price_usd) })),
        categoryMap(),
      );
      source = 'live DB';
    } finally {
      await prisma.$disconnect();
    }
  }

  if (providers.length === 0) {
    throw new Error('gen-catalog-page: zero active providers — refusing to write an empty catalog');
  }
  const totalTools = providers.reduce((sum, p) => sum + p.tools, 0);
  writeFileSync('static/catalog.html', renderPage(providers));
  console.log(
    `gen-catalog-page: wrote static/catalog.html from ${source} (${totalTools} tools / ${providers.length} providers)`,
  );
}

main().catch((err) => {
  console.error('gen-catalog-page failed:', err);
  process.exitCode = 1;
});
