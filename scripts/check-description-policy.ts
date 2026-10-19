/**
 * T-0430: prints every tool description that reads as an instruction to the agent.
 * Usage: npx ts-node scripts/check-description-policy.ts   (exit 1 on offenders)
 */
import { TOOL_DEFINITIONS } from '../src/mcp/tool-definitions';
import { descriptionViolations } from '../src/utils/description-policy';

let bad = 0;
for (const d of TOOL_DEFINITIONS) {
  const v = descriptionViolations(d.description);
  if (v.length) {
    bad++;
    console.log(`${d.toolId}: [${v.join(', ')}] ${d.description}`);
  }
}
console.log(`${bad} offender(s) of ${TOOL_DEFINITIONS.length} descriptions`);
process.exit(bad ? 1 : 0);
