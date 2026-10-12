/**
 * T-0333: BUILT-NOT-ENABLED detector. Lists tools defined in code (TOOL_DEFINITIONS) that are
 * absent from the `tools` table, so invisible to REST/MCP. Read-only; never seeds.
 *
 * Usage: npx tsx scripts/check-seed-drift.ts [--list]
 *   exit 1 when drift exists, unless --list (always exit 0, for summaries).
 */

import { PrismaClient } from '@prisma/client';
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';
import { computeDrift, loadYamlTools } from './seed-plan';

async function main(): Promise<void> {
  const listOnly = process.argv.includes('--list');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.tool.findMany({ select: { tool_id: true } });
    const drift = computeDrift(
      TOOL_DEFINITIONS,
      new Set(rows.map((r) => r.tool_id)),
      loadYamlTools(),
    );
    // eslint-disable-next-line no-console
    console.log(`seed-drift: ${drift.length} tool(s) defined in code but absent from tools`);
    for (const d of drift) {
      // eslint-disable-next-line no-console
      console.log(
        `${d.tool_id}\tprovider=${d.provider}\tcategory=${d.category}\tprice=${d.price_usd ?? 'none'}\tcost_model=${d.has_cost_model ? 'yes' : 'no'}`,
      );
    }
    process.exitCode = drift.length > 0 && !listOnly ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed-drift] FATAL:', err);
    process.exit(2);
  });
}
