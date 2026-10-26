/**
 * gen-site-facts.ts — T-0542: the one machine-readable facts file the public pages are checked against.
 *
 * Writes static/.well-known/site-facts.json (pretty JSON, sorted keys, no timestamp, so the file is
 * byte-stable). Every value is imported from the code that decides it, read from a committed file, or
 * (for facts with no code constant) taken from config/site-facts.manual.json, where each entry carries a
 * verbatim `anchor` that must still exist in its source file: whoever changes the code must re-state
 * the fact, otherwise this generator fails.
 *
 * Run:   npx tsx scripts/gen-site-facts.ts            write
 *        npx tsx scripts/gen-site-facts.ts --check    compare a regenerated candidate byte for byte
 * Env:   SITE_FACTS_ROOT=<dir> reads the manual file and the anchor sources from another tree
 *        (tests use a temp copy with an anchor removed).
 * Tool status: scripts/discovery-snapshot.tsv lists the healthy tools (it is what mcp.json counts).
 *   in the snapshot = healthy; in TOOL_DEFINITIONS but not in the snapshot = unavailable (the snapshot
 *   cannot tell degraded from unavailable); in neither = absent.
 * No model call, no network, no DB.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';
import { NEGOTIATED_PROTOCOL_VERSIONS } from '../src/mcp/list-cache';
import { STAGE_NAMES } from '../src/pipeline/types';
import * as H from '../src/config/http-headers';
import { LEGAL_DOC_IDS, readLegalFile } from '../src/shop/legal/legal-docs';
import { CHAIN_ID, CONTRACT_ADDRESS, EXPLORER_BASE, RPC_URL } from './attest/attest-view';

const ROOT = resolve(__dirname, '..');
const SRC_ROOT = process.env.SITE_FACTS_ROOT ? resolve(process.env.SITE_FACTS_ROOT) : ROOT;
const OUT = join(ROOT, 'static/.well-known/site-facts.json');
const CHECK_MODE = process.argv.includes('--check');

const readText = (root: string, p: string): string => readFileSync(join(root, p), 'utf8');

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** config/site-docs-register.json plus the long date the pages print ("October 26, 2026"). */
function docRegister(): Record<string, unknown> {
  const reg = JSON.parse(readText(SRC_ROOT, 'config/site-docs-register.json')) as Record<
    string,
    { version: string; updated: string }
  >;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(reg)) {
    if (k.startsWith('_')) continue;
    const [y, m, d] = v.updated.split('-').map(Number);
    out[k] = { ...v, updated_text: `${MONTHS[m - 1]} ${d}, ${y}` };
  }
  return out;
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, sortKeys(o[k])]),
    );
  }
  return v;
}

function fail(msg: string): never {
  console.error(`gen-site-facts: ${msg}`);
  process.exit(1);
}

// --- manual facts, each pinned to a verbatim anchor in its source -----------------------------------------
interface ManualFact {
  value: unknown;
  source: string;
  anchor: string;
  ruling: string;
}

function flatten(prefix: string, node: unknown, out: Record<string, ManualFact>): void {
  const n = node as Record<string, unknown>;
  if (n && typeof n === 'object' && 'anchor' in n && 'source' in n && 'value' in n) {
    out[prefix] = n as unknown as ManualFact;
    return;
  }
  if (n && typeof n === 'object') {
    for (const k of Object.keys(n)) flatten(prefix ? `${prefix}.${k}` : k, n[k], out);
  }
}

function manualFacts(): Record<string, unknown> {
  const raw = JSON.parse(readText(SRC_ROOT, 'config/site-facts.manual.json')) as Record<
    string,
    unknown
  >;
  const flat: Record<string, ManualFact> = {};
  for (const k of Object.keys(raw)) if (!k.startsWith('_')) flatten(k, raw[k], flat);
  const out: Record<string, unknown> = {};
  for (const [name, f] of Object.entries(flat)) {
    const srcPath = join(SRC_ROOT, f.source);
    if (!existsSync(srcPath)) fail(`manual fact "${name}": source file ${f.source} does not exist`);
    if (!readFileSync(srcPath, 'utf8').includes(f.anchor)) {
      fail(`manual fact "${name}": anchor not found in ${f.source}: ${JSON.stringify(f.anchor)}`);
    }
    const parts = name.split('.');
    let cur = out;
    for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>;
    cur[parts[parts.length - 1]] = f.value;
  }
  return out;
}

// --- tools: healthy set, tiers, TTLs ----------------------------------------------------------------------
type ToolStatus = 'healthy' | 'degraded' | 'unavailable' | 'absent';

function loadSnapshot(): Map<string, number> {
  const m = new Map<string, number>();
  for (const line of readText(ROOT, 'scripts/discovery-snapshot.tsv').split('\n').filter(Boolean)) {
    const [id, , price] = line.split('\t');
    m.set(id, Number(price));
  }
  return m;
}

// --- registration endpoints from the Express router stack -------------------------------------------------
function routePaths(router: unknown): string[] {
  const stack = (
    router as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }
  ).stack;
  const out: string[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const m of Object.keys(layer.route.methods))
      out.push(`${m.toUpperCase()} ${layer.route.path}`);
  }
  return out;
}

// --- example tool ids quoted on the pages -----------------------------------------------------------------
function walk(dir: string, exts: RegExp, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (name !== 'site-facts.json' && (exts.test(name) || p.includes('/.well-known/')))
      out.push(p);
  }
}

function exampleTools(
  snapshot: Map<string, number>,
  defined: Set<string>,
): Record<string, ToolStatus> {
  const files: string[] = [];
  walk(join(ROOT, 'static'), /\.(html|md|txt)$/, files);
  for (const f of ['README.md', 'docs/payments.md']) files.push(join(ROOT, f));
  const providers = new Set([...defined, ...snapshot.keys()].map((id) => id.split('.')[0]));
  const found = new Map<string, Set<string>>();
  const add = (id: string, file: string) => {
    if (!found.has(id)) found.set(id, new Set());
    found.get(id)!.add(relative(ROOT, file));
  };
  for (const f of files) {
    if (/\.(mp4|png|jpe?g|svg)$/i.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/tools\/([a-z0-9_]+\.[a-z0-9_]+)\/call/g)) add(m[1], f);
    for (const m of text.matchAll(/(?:`|"name":\s*")([a-z0-9_]+\.[a-z0-9_]+)(?:`|")/g)) {
      if (providers.has(m[1].split('.')[0])) add(m[1], f);
    }
  }
  const out: Record<string, ToolStatus> = {};
  for (const id of [...found.keys()].sort()) {
    const status: ToolStatus = snapshot.has(id)
      ? 'healthy'
      : defined.has(id)
        ? 'unavailable'
        : 'absent';
    out[id] = status;
  }
  return out;
}

async function build(): Promise<string> {
  // The service modules validate the environment when imported (config/env.ts). Nothing here connects
  // to anything, so inert placeholders are enough; they are set before these dynamic imports.
  process.env.NODE_ENV = 'test';
  const inert = 'postgresql://site-facts:unused@127.0.0.1:1/unused';
  for (const k of ['DATABASE_URL', 'DATABASE_URL_WORKER', 'DATABASE_URL_OUTBOX'])
    process.env[k] ??= inert;
  process.env['API_KEY_' + 'SECRET'] ??= 'site-facts-placeholder-0000000000000000';
  const { PROMPT_NAMES } = await import('../src/mcp/prompt-adapter');
  const { priceTier } = await import('../src/services/tool-registry.service');
  const { TIER_RATE_LIMITS } = await import('../src/services/agent.service');
  const rails = await import('../src/pipeline/stages/escrow.stage');
  const { CONTENT_RETENTION_MS, APPEAL_WINDOW_DAYS } =
    await import('../src/pipeline/stages/moderation.stage');
  const { agentsRouter } = await import('../src/routes/agents.router');
  const { oauthRouter } = await import('../src/routes/oauth.router');
  const pkg = JSON.parse(readText(ROOT, 'package.json')) as { version: string };
  const mcp = JSON.parse(readText(ROOT, 'static/.well-known/mcp.json')) as Record<string, unknown>;
  const x402 = JSON.parse(readText(ROOT, 'static/.well-known/x402-payment.json')) as {
    facilitators: Array<{ name: string; role: string }>;
  };
  const snapshot = loadSnapshot();
  const defined = new Set(TOOL_DEFINITIONS.map((t) => t.toolId));

  const cfg = parseYaml(readText(ROOT, 'config/tool_provider_config.yaml')) as {
    tools: Array<{ tool_id: string; cache_ttl: number }>;
  };
  // TTL 0 means "not cached"; the published range covers cached tools only.
  const ttls = cfg.tools
    .filter((t) => snapshot.has(t.tool_id) && t.cache_ttl > 0)
    .map((t) => t.cache_ttl);

  const tiers = { micro: [] as number[], standard: [] as number[], premium: [] as number[] };
  for (const p of snapshot.values()) tiers[priceTier(p)].push(p);
  const paid = [...snapshot.values()].filter((p) => p > 0);
  const lo = (a: number[]) => (a.length ? Math.min(...a) : null);
  const hi = (a: number[]) => (a.length ? Math.max(...a) : null);

  const regEndpoints = [...routePaths(agentsRouter), ...routePaths(oauthRouter)].sort();
  const absent = ['/api/v1/agents/rotate'];
  for (const a of absent) {
    if (regEndpoints.some((e) => e.endsWith(` ${a}`))) fail(`${a} is mounted but listed as absent`);
  }

  const headerKeys = [
    'X_IDEMPOTENCY_KEY',
    'X_APIBASE_RECEIPT',
    'X_APIBASE_CHARGED',
    'X_PAYMENT',
    'PAYMENT_SIGNATURE',
    'X_RATELIMIT_LIMIT',
    'X_RATELIMIT_REMAINING',
    'X_RATELIMIT_RESET',
  ] as const;
  const headers: Record<string, string> = {};
  for (const k of headerKeys) {
    const v = (H as Record<string, unknown>)[k];
    if (typeof v !== 'string') fail(`http-headers.ts no longer exports ${k}`);
    headers[k] = v;
  }

  const rules = readdirSync(join(ROOT, 'prometheus/rules')).sort();
  let alerts = 0;
  for (const f of rules) {
    alerts += readText(ROOT, `prometheus/rules/${f}`)
      .split('\n')
      .filter((l) => l.includes('alert:')).length;
  }
  const services = new Set<string>();
  for (const f of readdirSync(ROOT)
    .filter((n) => /^docker-compose.*\.ya?ml$/.test(n))
    .sort()) {
    const y = parseYaml(readText(ROOT, f)) as { services?: Record<string, unknown> };
    for (const s of Object.keys(y.services ?? {})) services.add(s);
  }

  const manual = manualFacts();
  const receipts = manual.receipts;
  delete manual.receipts;
  const facts = {
    absent_endpoints: absent,
    alert_rules_count: alerts,
    cache_ttl_seconds: {
      max: Math.max(...ttls),
      max_days: Math.max(...ttls) / 86_400,
      min: Math.min(...ttls),
    },
    categories_count: mcp.categories_count,
    containers_count: services.size,
    doc_register: docRegister(),
    example_tools: exampleTools(snapshot, defined),
    facilitator: Object.fromEntries(x402.facilitators.map((f) => [f.role, f.name])),
    free_tools_count: [...snapshot.values()].filter((p) => p === 0).length,
    genlayer: {
      chain_id: CHAIN_ID,
      contract_address: CONTRACT_ADDRESS,
      explorer_host: new URL(EXPLORER_BASE).host,
      rpc_host: new URL(RPC_URL).host,
    },
    headers,
    integrator: mcp.integrator,
    legal_docs: LEGAL_DOC_IDS.map((id) => {
      const d = readLegalFile(id);
      return { effective_from: String(d.effective_from).slice(0, 10), id, version: d.version };
    }),
    manual,
    mcp_prompts: Object.values(PROMPT_NAMES).sort(),
    min_paid_price_usd: Math.min(...paid),
    moderation: {
      appeal_window_days: APPEAL_WINDOW_DAYS,
      content_retention_days: CONTENT_RETENTION_MS / 86_400_000,
    },
    pipeline_stages: [...STAGE_NAMES],
    price_p90_usd: (mcp.price_range_usd as { p90: number }).p90,
    price_range_usd: mcp.price_range_usd,
    protocol_versions: [...NEGOTIATED_PROTOCOL_VERSIONS],
    providers_count: mcp.providers_count,
    rails: [...rails.PAYMENT_RAILS],
    rate_limits: TIER_RATE_LIMITS,
    receipts, // anchor-pinned in config/site-facts.manual.json
    registration_endpoints: regEndpoints,
    tiers: {
      micro: { count: tiers.micro.length, max_usd: hi(tiers.micro) },
      premium: { count: tiers.premium.length, min_usd: lo(tiers.premium) },
      standard: {
        count: tiers.standard.length,
        max_usd: hi(tiers.standard),
        min_usd: lo(tiers.standard),
      },
    },
    tiers_counted_over: 'healthy tools = rows of scripts/discovery-snapshot.tsv',
    tools_count: mcp.tools_count,
    version: pkg.version,
  };
  return JSON.stringify(sortKeys(facts), null, 2) + '\n';
}

async function main(): Promise<void> {
  const candidate = await build();
  if (CHECK_MODE) {
    const existing = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
    if (existing !== candidate) {
      console.error('gen-site-facts --check: DRIFT in static/.well-known/site-facts.json');
      process.exit(1);
    }
    console.log('gen-site-facts --check: OK, 0 drift');
    process.exit(0);
  }
  writeFileSync(OUT, candidate);
  console.log(`gen-site-facts: wrote ${relative(ROOT, OUT)} (${candidate.length} bytes)`);
  process.exit(0);
}

main().catch((e) => fail(String(e)));
