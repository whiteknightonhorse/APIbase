/**
 * gen-discovery.ts — single generator for every machine-readable discovery surface.
 *
 * ZZ-03-06 (Fable ruling on disputes/zz-03-apibase-design.q-7.ruling-1.md): five+ of these
 * files had drifted out of sync with each other and with the live catalog (e.g.
 * ai-capabilities.json said "1227 tools / 347 providers", dated 2026-04-01, while the live
 * DB was already at 1384 — three self-contradictory numbers inside that ONE file). Root
 * cause: they were hand-maintained JSON, edited (or not) whenever someone remembered.
 *
 * Source of truth (the ruling's own wording): TOOL_DEFINITIONS ∩ active DB snapshot
 * (status != 'unavailable') — NOT TOOL_DEFINITIONS alone (1436 entries, ~50 more than what's
 * actually seeded/active; that gap is exactly what caused openapi.json's 52-path surplus).
 *
 * Writes wholesale (not sed-patched): agent.json, ai-capabilities.json, ucp, acp.json,
 * agent-skills/index.json, agent-skills/discover-tools.md, mcp.json. Every one of these files
 * is now idempotent: run this twice with no change in the underlying truth and NOT ONE BYTE
 * changes on disk (see writeJsonIfChanged/writeTextIfChanged below) — no daily date-churn
 * commits for files whose numbers didn't move.
 *
 * Run: npx tsx scripts/gen-discovery.ts
 * (same SYNC_COUNTS_SNAPSHOT env convention as gen-card.ts/gen-catalog-page.ts — see T-05,
 * 2026-09-04, ruling-1 — so every generator invoked by one sync-counts.sh self-heal run reads
 * the exact same frozen tool_id->provider snapshot instead of racing AP-8's continuous writes.)
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';

const prisma = new PrismaClient();
const ROOT = resolve(__dirname, '..');

const { version: PACKAGE_VERSION } = JSON.parse(
  readFileSync(resolve(ROOT, 'package.json'), 'utf8'),
) as { version: string };

// ---------------------------------------------------------------------------
// Source of truth: TOOL_DEFINITIONS ∩ active DB snapshot
// ---------------------------------------------------------------------------

/** tool_id -> provider, for every currently-active (status != 'unavailable') row. */
async function loadActiveProviderMap(): Promise<Map<string, string>> {
  const snapshotPath = process.env.SYNC_COUNTS_SNAPSHOT;
  if (snapshotPath) {
    const lines = readFileSync(snapshotPath, 'utf8').split('\n').filter(Boolean);
    const m = new Map<string, string>();
    for (const line of lines) {
      const [toolId, provider] = line.split('\t');
      if (toolId && provider) m.set(toolId, provider);
    }
    return m;
  }
  const rows = await prisma.tool.findMany({
    where: { status: { not: 'unavailable' } },
    select: { tool_id: true, provider: true },
  });
  return new Map(rows.map((r) => [r.tool_id, r.provider]));
}

const ACRONYMS = new Set([
  'usda',
  'fda',
  'openfda',
  'who',
  'cdc',
  'nasa',
  'usgs',
  'noaa',
  'fcc',
  'nist',
  'nvd',
  'iban',
  'gleif',
  'nhtsa',
  'irctc',
  'gdelt',
  'fred',
  'fdic',
  'ecb',
  'bls',
  'iqair',
  'nws',
  'iata',
  'lei',
  'onet',
  'ip',
  'qr',
  'ocr',
  'dns',
  'sirene',
  'siret',
  'siren',
  'abn',
  'acn',
  'ads-b',
  'vin',
  'pdf',
  'nrel',
  'nbi',
  'gdacs',
  'vatcomply',
  'vat',
  'scb',
  'ssb',
  'sec',
  'ftc',
  'epa',
  'nrel-afdc',
  'sdwis',
  'gho',
  'gbif',
]);

/** Best-effort display name for a raw `tools.provider` slug — derived, never hand-typed per-provider. */
function displayName(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) =>
      ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(' ');
}

interface CategoryStat {
  category: string;
  tools: number;
  providers: string[];
}

function buildCategoryStats(
  activeDefs: typeof TOOL_DEFINITIONS,
  providerOf: Map<string, string>,
): CategoryStat[] {
  const byCategory = new Map<string, { count: number; providers: Set<string> }>();
  for (const def of activeDefs) {
    const cat = def.category ?? 'other';
    let entry = byCategory.get(cat);
    if (!entry) {
      entry = { count: 0, providers: new Set() };
      byCategory.set(cat, entry);
    }
    entry.count += 1;
    const provider = providerOf.get(def.toolId);
    if (provider) entry.providers.add(provider);
  }
  return [...byCategory.entries()]
    .map(([category, v]) => ({
      category,
      tools: v.count,
      providers: [...v.providers].sort(),
    }))
    .sort((a, b) => b.tools - a.tools);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Idempotent write helpers — build the candidate with the OLD date first; if that's
// byte-identical to what's on disk, nothing actually changed, so don't touch the file at all
// (no updated_at churn on a day where the underlying truth didn't move).
// ---------------------------------------------------------------------------

function readExisting(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function writeJsonIfChanged(
  path: string,
  getDate: (obj: Record<string, unknown>) => string | undefined,
  setDate: (obj: Record<string, unknown>, date: string) => void,
  build: () => Record<string, unknown>,
): boolean {
  const existingRaw = readExisting(path);
  const existing = existingRaw ? (JSON.parse(existingRaw) as Record<string, unknown>) : null;
  const oldDate = (existing && getDate(existing)) || today();

  const candidateOld = build();
  setDate(candidateOld, oldDate);
  const candidateOldStr = JSON.stringify(candidateOld, null, 2) + '\n';

  if (candidateOldStr === existingRaw) return false;

  const candidateNew = build();
  setDate(candidateNew, today());
  writeFileSync(path, JSON.stringify(candidateNew, null, 2) + '\n');
  console.log(`gen-discovery: wrote ${path}`);
  return true;
}

function writeTextIfChanged(path: string, content: string): boolean {
  const existing = readExisting(path);
  if (existing === content) return false;
  writeFileSync(path, content);
  console.log(`gen-discovery: wrote ${path}`);
  return true;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const providerOf = await loadActiveProviderMap();
  const activeDefs = TOOL_DEFINITIONS.filter((d) => providerOf.has(d.toolId));

  const orphaned = TOOL_DEFINITIONS.length - activeDefs.length;
  if (orphaned > 0) {
    console.warn(
      `gen-discovery: ${orphaned} TOOL_DEFINITIONS entr(y/ies) have no active DB row, excluded from every generated surface`,
    );
  }

  const TOOLS = activeDefs.length;
  const PROV = new Set(providerOf.values()).size;
  const stats = buildCategoryStats(activeDefs, providerOf);
  const CATS = stats.length;

  const travel = stats.find((s) => s.category === 'travel');
  const travelLine =
    travel && travel.tools > 0
      ? `${travel.tools} travel tools (${travel.providers.slice(0, 3).join(', ')})`
      : 'top matching tools ranked by relevance';

  let changed = 0;

  // -------------------------------------------------------------------
  // mcp.json
  // -------------------------------------------------------------------
  if (
    writeJsonIfChanged(
      resolve(ROOT, 'static/.well-known/mcp.json'),
      (o) => o.updated_at as string,
      (o, d) => {
        o.updated_at = d;
      },
      () => ({
        name: 'APIbase',
        description: `Unified MCP gateway to ${TOOLS} API tools from ${PROV} providers. Pay-per-call via x402 USDC micropayments.`,
        protocol: 'MCP',
        protocolVersion: '2025-03-26',
        transport: 'streamable-http',
        url: 'https://apibase.pro/mcp',
        version: PACKAGE_VERSION,
        tools_endpoint: 'https://apibase.pro/api/v1/tools',
        tools_count: TOOLS,
        providers_count: PROV,
        categories_count: CATS,
        authentication: {
          type: 'bearer',
          required: false,
          description:
            'API key (ak_live_...) via Authorization: Bearer header. Optional — auto-registration supported.',
          payment: ['x402', 'mpp'],
        },
        capabilities: { tools: true, prompts: true, resources: false },
        payment: {
          x402: {
            enabled: true,
            version: 2,
            network: 'eip155:8453',
            network_name: 'Base mainnet',
            asset: 'USDC',
            asset_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            pay_to: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
            facilitator: 'self-hosted',
            scheme: 'exact',
          },
          mpp: {
            enabled: true,
            version: 'draft-ryan-httpauth-payment',
            network: 'tempo',
            asset: 'USDC',
          },
        },
        compatible_with: [
          'base-mcp',
          'claude-desktop',
          'claude-code',
          'chatgpt',
          'cursor',
          'windsurf',
          'openai-agents-sdk',
          'langchain',
          'google-adk',
          'crewai',
        ],
        prompts: [
          'discover_tools',
          'find_cheapest_flight',
          'crypto_market_overview',
          'prediction_market_research',
        ],
        discovery_hint:
          "Call prompt 'discover_tools' to browse tools by category or task instead of loading all schemas into context.",
        documentation: 'https://apibase.pro/ai.txt',
        openapi: 'https://apibase.pro/.well-known/openapi.json',
        server_card: 'https://apibase.pro/.well-known/mcp/server-card.json',
        source: 'https://github.com/whiteknightonhorse/APIbase',
        status: 'active',
        updated_at: today(),
      }),
    )
  )
    changed++;

  // -------------------------------------------------------------------
  // agent.json
  // -------------------------------------------------------------------
  if (
    writeJsonIfChanged(
      resolve(ROOT, 'static/.well-known/agent.json'),
      (o) => o.updated_at as string,
      (o, d) => {
        o.updated_at = d;
      },
      () => ({
        name: 'APIbase',
        description: `Unified MCP gateway to ${TOOLS} API tools from ${PROV} providers across ${CATS} categories. Pay-per-call via x402 USDC micropayments on Base.`,
        url: 'https://apibase.pro',
        version: PACKAGE_VERSION,
        protocol: 'MCP',
        transport: 'streamable-http',
        mcp_endpoint: 'https://apibase.pro/mcp',
        capabilities: ['tools', 'prompts'],
        tools_count: TOOLS,
        providers_count: PROV,
        authentication: {
          schemes: ['bearer'],
          required: false,
          auto_registration: true,
          key_format: 'ak_live_{32hex}',
        },
        payment: {
          protocols: ['x402', 'mpp'],
          network: 'eip155:8453',
          token: 'USDC',
          price_range_usd: [0.001, 0.035],
        },
        discovery: {
          ai_txt: 'https://apibase.pro/ai.txt',
          llms_txt: 'https://apibase.pro/llms.txt',
          mcp_json: 'https://apibase.pro/.well-known/mcp.json',
          openapi: 'https://apibase.pro/.well-known/openapi.json',
          server_card: 'https://apibase.pro/.well-known/mcp/server-card.json',
          tool_catalog: 'https://apibase.pro/api/v1/tools',
        },
        contact: { github: 'https://github.com/whiteknightonhorse/APIbase' },
        updated_at: today(),
      }),
    )
  )
    changed++;

  // -------------------------------------------------------------------
  // ai-capabilities.json
  // -------------------------------------------------------------------
  if (
    writeJsonIfChanged(
      resolve(ROOT, 'static/.well-known/ai-capabilities.json'),
      (o) => (o.updated_at as string | undefined)?.slice(0, 10),
      (o, d) => {
        o.updated_at = `${d}T00:00:00Z`;
      },
      () => ({
        platform: 'APIbase',
        version: PACKAGE_VERSION,
        updated_at: `${today()}T00:00:00Z`,
        tools_count: TOOLS,
        providers_count: PROV,
        mcp_endpoint: 'https://apibase.pro/mcp',
        discovery: {
          method: 'MCP prompt',
          prompt_name: 'discover_tools',
          description: `Call discover_tools to browse ${TOOLS} tools by category or task instead of loading all schemas into context.`,
          examples: [
            { args: {}, result: `${CATS} categories with tool counts` },
            { args: { category: 'travel' }, result: travelLine },
            {
              args: { task: 'search flights from NYC' },
              result: 'top matching tools ranked by relevance',
            },
          ],
        },
        categories: stats.map((s) => ({
          name: s.category,
          tools: s.tools,
          providers: s.providers.map(displayName).join(', '),
          examples: `Call discover_tools with category="${s.category}" for the current tool list and descriptions.`,
        })),
      }),
    )
  )
    changed++;

  // -------------------------------------------------------------------
  // ucp (no file extension)
  // -------------------------------------------------------------------
  if (
    writeJsonIfChanged(
      resolve(ROOT, 'static/.well-known/ucp'),
      (o) => (o.ucp as Record<string, unknown> | undefined)?.updated_at as string,
      (o, d) => {
        (o.ucp as Record<string, unknown>).updated_at = d;
      },
      () => ({
        ucp: {
          version: '1.0',
          protocol_version: '1.0',
          protocol_name: 'UCP',
          site: 'https://apibase.pro',
          services: [
            {
              name: 'apibase-tools',
              type: 'api-aggregation',
              description: `${TOOLS} API tools from ${PROV} providers under one MCP endpoint, pay-per-call via x402 or MPP`,
              endpoint: 'https://apibase.pro/mcp',
              catalog: 'https://apibase.pro/api/v1/tools',
            },
          ],
          capabilities: [
            'pay-per-call',
            'micropayments-usdc-base',
            'micropayments-usdc-tempo',
            'mcp-streamable-http',
            'oauth2-client-credentials',
            'auto-registration',
          ],
          endpoints: {
            mcp: 'https://apibase.pro/mcp',
            rest_catalog: 'https://apibase.pro/api/v1/tools',
            openapi: 'https://apibase.pro/.well-known/openapi.json',
            server_card: 'https://apibase.pro/.well-known/mcp/server-card.json',
            x402_config: 'https://apibase.pro/.well-known/x402-payment.json',
            oauth_authorization_server:
              'https://apibase.pro/.well-known/oauth-authorization-server',
            oauth_token: 'https://apibase.pro/oauth/token',
            oauth_register: 'https://apibase.pro/oauth/register',
          },
          payment: {
            rails: ['x402', 'mpp'],
            token: 'USDC',
            price_range_usd: { min: 0.001, max: 0.035 },
            wallet: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
          },
          documentation: 'https://apibase.pro/ai.txt',
          updated_at: today(),
        },
      }),
    )
  )
    changed++;

  // -------------------------------------------------------------------
  // acp.json
  // -------------------------------------------------------------------
  if (
    writeJsonIfChanged(
      resolve(ROOT, 'static/.well-known/acp.json'),
      (o) => o.updated_at as string,
      (o, d) => {
        o.updated_at = d;
      },
      () => ({
        protocol: { name: 'acp', version: '1.0' },
        api_base_url: 'https://apibase.pro',
        transports: ['http', 'mcp'],
        capabilities: {
          services: [
            'api-aggregation',
            'pay-per-call',
            'tool-execution',
            'auto-registration',
            'micropayments-x402',
            'micropayments-mpp',
          ],
          checkout: false,
          product_catalog: {
            url: 'https://apibase.pro/api/v1/tools',
            count: TOOLS,
            type: 'api-tool-catalog',
          },
          supported_payment_methods: [
            {
              type: 'x402',
              token: 'USDC',
              network: 'base',
              docs: 'https://apibase.pro/.well-known/x402-payment.json',
            },
            {
              type: 'mpp',
              token: 'USDC.e',
              network: 'tempo',
              docs: 'https://apibase.pro/.well-known/x402-payment.json',
            },
          ],
        },
        discovery: {
          mcp_server_card: 'https://apibase.pro/.well-known/mcp/server-card.json',
          openapi: 'https://apibase.pro/.well-known/openapi.json',
          agent_card: 'https://apibase.pro/.well-known/agent.json',
        },
        contact: 'https://github.com/whiteknightonhorse/APIbase',
        updated_at: today(),
      }),
    )
  )
    changed++;

  // -------------------------------------------------------------------
  // agent-skills/discover-tools.md (generated first — its sha256 feeds index.json below)
  // -------------------------------------------------------------------
  const discoverToolsPath = resolve(ROOT, 'static/.well-known/agent-skills/discover-tools.md');
  const discoverToolsMd = `---
name: discover-tools
description: Progressive-disclosure workflow for finding relevant tools in APIbase's ${TOOLS}-tool catalog without loading every schema into the agent context.
---

# Skill: Discover tools on APIbase

APIbase exposes ${TOOLS} tools across ${CATS} categories. Loading all schemas into context
costs hundreds of thousands of tokens, which is wasteful. Use the \`discover_tools\` prompt to
find only the tools relevant to the current task.

## When to use

- The agent has a fresh goal and does not yet know which tool(s) to call.
- The agent's system prompt should not preload the full catalog.
- The MCP server has more than ~50 tools (APIbase has ${TOOLS}).

## Steps

1. **Connect to the MCP server.**

   \`\`\`
   POST https://apibase.pro/mcp
   Content-Type: application/json
   Authorization: Bearer <ak_live_...>   # optional — auto-registration on first call
   \`\`\`

2. **Call the \`discover_tools\` prompt.** Three usage modes:

   | Call | Returns |
   |---|---|
   | \`discover_tools\` (no args) | ${CATS} categories with tool counts |
   | \`discover_tools category="travel"\` | ${travel?.tools ?? 0} travel tools with descriptions |
   | \`discover_tools task="find flights from NYC to Tokyo"\` | Top tools ranked by keyword relevance |

3. **Inspect the returned tool names and descriptions.** Pick the 1–3 tools that
   match the agent's goal.

4. **Call the chosen tool via \`tools/call\`.** All ${TOOLS} tools are always callable —
   the \`discover_tools\` prompt is advisory, not a gate.

   \`\`\`json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": { "name": "amadeus.flight_search", "arguments": { "...": "..." } }
   }
   \`\`\`

5. **Handle \`402 Payment Required\`** the first time you hit a paid tool.
   See the \`x402-payment\` skill for the payment flow.

## Alternative: full catalog

If the agent really needs every tool (e.g., for offline indexing), use:

\`\`\`
GET https://apibase.pro/api/v1/tools
\`\`\`

Returns all ${TOOLS} tools with full JSON Schemas. Use sparingly — the response is
large.

## Why this exists

Agents that preload hundreds of tool schemas waste context and latency. Progressive
disclosure keeps the agent fast and focused while preserving full catalog
access for the rare cases that need it.
`;
  if (writeTextIfChanged(discoverToolsPath, discoverToolsMd)) changed++;

  // -------------------------------------------------------------------
  // agent-skills/index.json — sha256 recomputed from actual on-disk bytes of ALL THREE
  // skill files every run, not just the one this generator itself writes. Closes the
  // "hand-edited x402-payment.md/auto-register.md without recomputing sha256" drift class too.
  // -------------------------------------------------------------------
  const skillsDir = resolve(ROOT, 'static/.well-known/agent-skills');
  const x402PaymentPath = resolve(skillsDir, 'x402-payment.md');
  const autoRegisterPath = resolve(skillsDir, 'auto-register.md');

  if (
    writeJsonIfChanged(
      resolve(skillsDir, 'index.json'),
      (o) => o.updated as string,
      (o, d) => {
        o.updated = d;
      },
      () => ({
        $schema: 'https://agentskills.io/schema/v0.2.0/index.json',
        version: '0.2.0',
        publisher: { name: 'APIbase', url: 'https://apibase.pro' },
        updated: today(),
        skills: [
          {
            name: 'discover-tools',
            type: 'skill',
            description: `Progressive-disclosure workflow for finding relevant tools in APIbase's ${TOOLS}-tool catalog without loading every schema into the agent context.`,
            url: 'https://apibase.pro/.well-known/agent-skills/discover-tools.md',
            sha256: sha256File(discoverToolsPath),
          },
          {
            name: 'x402-payment',
            type: 'skill',
            description:
              'How to pay for APIbase tools using x402 (USDC on Base) or MPP (USDC.e on Tempo). Covers the 402 challenge, payment construction, and the Payment-Required retry.',
            url: 'https://apibase.pro/.well-known/agent-skills/x402-payment.md',
            sha256: sha256File(x402PaymentPath),
          },
          {
            name: 'auto-register',
            type: 'skill',
            description:
              'How APIbase auto-registers new agents on first contact — no signup form, no human in the loop. Credentials are issued at request time and returned in the response.',
            url: 'https://apibase.pro/.well-known/agent-skills/auto-register.md',
            sha256: sha256File(autoRegisterPath),
          },
        ],
      }),
    )
  )
    changed++;

  console.log(
    `gen-discovery: ${TOOLS} tools / ${PROV} providers / ${CATS} categories — ${changed} file(s) changed`,
  );
}

main()
  .catch((err) => {
    console.error('gen-discovery failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
