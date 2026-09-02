// gen-catalog-page.ts — regenerates static/catalog.html wholesale from live DB truth.
//
// Same reasoning as gen-card.ts (server-card.json): a hand-authored provider list would drift
// the moment onboarding adds/removes a provider. This script queries the exact same filter the
// live catalog routes serve (status != 'unavailable' — src/services/tool-registry.service.ts)
// and rewrites the whole file every run, so it can never disagree with /api/v1/tools or the
// synced tool/provider counts. Called from sync-counts.sh alongside gen-card.ts.
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';

const prisma = new PrismaClient();

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function main() {
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

  const tableRows = providers
    .map((p) => `<tr><td>${escapeHtml(p.provider)}</td><td>${p.tools}</td></tr>`)
    .join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Catalog — APIbase.pro</title>
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
body{font-family:'JetBrains Mono','Fira Code','Cascadia Code','Courier New',monospace;background:#1a1a2e;color:#b0ffb0;line-height:1.7;padding:1.5rem;min-height:100vh;display:flex;justify-content:center;align-items:flex-start}
.window{max-width:880px;width:100%;background:#0c0c0c;border-radius:10px 10px 8px 8px;border:1px solid #444;box-shadow:0 20px 60px rgba(0,0,0,0.6),0 0 80px rgba(0,255,65,0.04),inset 0 0 80px rgba(0,255,65,0.01);overflow:hidden;position:relative}
.window::after{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.06) 0px,rgba(0,0,0,0.06) 1px,transparent 1px,transparent 3px);pointer-events:none;z-index:2}
.titlebar{background:linear-gradient(180deg,#3d3d3d 0%,#2a2a2a 100%);padding:10px 14px;display:flex;align-items:center;border-bottom:1px solid #1a1a1a;position:relative;z-index:4}
.dots{display:flex;gap:7px;flex-shrink:0}
.dot{width:13px;height:13px;border-radius:50%;border:1px solid rgba(0,0,0,0.2)}
.dot-red{background:#ff5f56;border-color:#e0443e}
.dot-yellow{background:#ffbd2e;border-color:#dea123}
.dot-green{background:#27c93f;border-color:#1aab29}
.titlebar-text{flex:1;text-align:center;color:#999;font-size:0.78rem;font-family:inherit;letter-spacing:0.5px}
.container{padding:1.8rem 2rem 2rem;position:relative;z-index:1}
nav{display:flex;flex-wrap:wrap;gap:0.3rem;margin-bottom:1rem;padding:0.5rem 0;border-bottom:1px solid #1a3a1a}
nav::before{content:'[';color:#555}nav::after{content:']';color:#555}
nav .brand{color:#00ff41;font-weight:700;font-size:1rem;text-decoration:none;text-shadow:0 0 8px rgba(0,255,65,0.4);padding:0.55rem 0.35rem 0.55rem 0;display:inline-block}
nav a{color:#00cc33;text-decoration:none;font-size:1rem;padding:0.55rem 0.35rem;display:inline-block}
nav a::before{content:' | ';color:#340}nav .brand::before{content:''}
nav a:hover{color:#00ff41;text-shadow:0 0 6px rgba(0,255,65,0.5)}
h1{color:#00ff41;font-size:1.3rem;margin-bottom:0.5rem;line-height:1.5;text-shadow:0 0 10px #00ff41,0 0 20px #00ff41,0 0 40px rgba(0,255,65,0.3)}
h1::before{content:'> ';color:#00aa30}
h2{color:#00ff41;font-size:1.05rem;margin:2rem 0 0.8rem;padding-left:1rem;border-left:2px solid #00aa30;text-shadow:0 0 6px rgba(0,255,65,0.2)}
h2::before{content:'## ';color:#006620}
p{margin-bottom:0.8rem;font-size:1rem;color:#a0d8a0}
strong{color:#33ff66}
.updated{color:#2a942a;font-size:0.82rem;margin-bottom:1.8rem}
a{color:#00ccff;text-decoration:none}
a:hover{color:#66ddff;text-shadow:0 0 6px rgba(0,204,255,0.4)}
table{width:100%;border-collapse:collapse;margin:0.8rem 0 1.4rem;font-size:0.83rem}
th,td{text-align:left;padding:0.4rem 0.7rem;border-bottom:1px solid #1a3a1a}
th{color:#00ff41;font-weight:700;border-bottom:1px solid #00aa30;position:sticky;top:0;background:#0c0c0c}
td{color:#a0d8a0}
td:last-child,th:last-child{text-align:right}
.scroll{max-height:60vh;overflow-y:auto;border:1px solid #1a3a1a;border-radius:6px}
.note{color:#5a9a5a;font-size:0.82rem;font-style:italic}
.footer{margin-top:2rem;padding:0.6rem 0;border-top:1px solid #1a3a1a;color:#2a942a;font-size:0.72rem;display:flex;flex-direction:column;gap:0.2rem}
.footer-row{display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem}
.footer .online{color:#00aa30}
*::-webkit-scrollbar{width:8px;height:8px}
*::-webkit-scrollbar-track{background:#0c0c0c;border:1px solid #1a3a1a}
*::-webkit-scrollbar-thumb{background:#1a5a1a;border-radius:4px;border:1px solid #0c0c0c}
*{scrollbar-width:thin;scrollbar-color:#1a5a1a #0c0c0c}
@media(max-width:600px){body{padding:0.5rem}.container{padding:1rem}h1{font-size:1.05rem}h1::before{content:''}nav::before,nav::after{display:none}.footer{font-size:0.65rem}}
</style>
</head>
<body>
<div class="window">
<div class="titlebar">
<div class="dots"><div class="dot dot-red"></div><div class="dot dot-yellow"></div><div class="dot dot-green"></div></div>
<span class="titlebar-text">apibase@prod ~ /srv/apibase/catalog</span>
</div>

<div class="container" id="main-content">

<nav>
<a class="brand" href="/">APIbase.pro</a>
<a href="/pricing">Pricing</a>
<a href="/catalog">Catalog</a>
<a href="/connect">Connect</a>
<a href="/dashboard">Dashboard</a>
<a href="/contact">Contact</a>
<a href="/privacy">Privacy</a>
<a href="/terms">Terms</a>
<a href="/policy/moderation">Moderation</a>
<a href="/frameworks">Frameworks</a>
<a href="https://github.com/whiteknightonhorse/APIbase">GitHub</a>
</nav>

<h1>Catalog</h1>
<p class="updated">Generated straight from the production database — never hand-edited, never rounded.</p>

<h2>Every live provider</h2>
<p><strong>${totalTools} tools</strong> across <strong>${totalProviders} providers</strong>, sorted by tool count. This is not a marketing figure &mdash; it is what <a href="/api/v1/tools">/api/v1/tools</a> and the MCP <code>tools/list</code> call actually serve right now.</p>
<div class="scroll">
<table>
<thead><tr><th>Provider</th><th>Tools</th></tr></thead>
<tbody>
${tableRows}
</tbody>
</table>
</div>
<p class="note">Machine-readable: <a href="/api/tools">/api/tools</a> (public, no auth, cached 1h) or the full paginated <a href="/api/v1/tools">/api/v1/tools</a> (filter by <code>?tier=</code> or <code>?max_price=</code>). Per-tool schemas and pricing: <a href="/pricing">/pricing</a>.</p>

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
</body>
</html>
`;

  writeFileSync('static/catalog.html', html);
  console.log(
    `gen-catalog-page: wrote static/catalog.html (${totalTools} tools / ${totalProviders} providers)`,
  );
}

main()
  .catch((err) => {
    console.error('gen-catalog-page failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
