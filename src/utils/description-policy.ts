/**
 * Description content policy (T-0430, Bazaar "metadata content policy").
 * A description says what a tool/product does and when it is useful; it must not instruct the agent.
 * The phrase list below is the single source of truth (test, CLI script, catalog gate).
 */

export const INSTRUCTION_PATTERNS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: 'ignore (all|any|previous)', re: /\bignore\s+(all|any|previous)\b/i },
  { label: 'always call', re: /\balways\s+call\b/i },
  { label: 'you must call', re: /\byou\s+must\s+call\b/i },
  { label: 'do not call other', re: /\bdo\s+not\s+call\s+other\b/i },
  { label: 'system prompt', re: /\bsystem\s+prompt\b/i },
  { label: 'as an ai', re: /\bas\s+an\s+ai\b/i },
  { label: 'disregard', re: /\bdisregard\b/i },
  { label: 'override', re: /\boverrid(e|es|ing)\b/i },
  { label: 'before (any|every) other tool', re: /\bbefore\s+(any|every)\s+other\s+tool\b/i },
  { label: 'instead of (any|all) other', re: /\binstead\s+of\s+(any|all)\s+other\b/i },
];

/** Returns the labels of every matched pattern; non-string input is reported as `not_a_string`. */
export function descriptionViolations(text: unknown): string[] {
  if (typeof text !== 'string') return ['not_a_string'];
  return INSTRUCTION_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}

export const readsAsInstruction = (text: unknown): boolean =>
  typeof text === 'string' && descriptionViolations(text).length > 0;
