import { ACTIVE_STATES, ALL_STATES } from '../../../src/shop/order-state';

/**
 * Reads the section 5.3 diagram text into a set of "FROM->TO" edges. Rules:
 *  - parenthesised labels are dropped (they contain state words: "before CONFIRMED");
 *  - `A ──► B ──► C` chains; `X | Y` after an arrow = alternative targets;
 *  - a line starting with an arrow or `└─` has its source = rightmost state token at or
 *    left of that column on the nearest earlier line;
 *  - a `▼` line: source = the state above its column, target = first state of the next state line;
 *  - "Любое из PAID…DELIVERED:" makes following arrow-led lines start from ACTIVE_STATES;
 *  - the phrases "продолжает путь" / "возвращается в прежнее состояние" = back into ACTIVE_STATES.
 */
export function parseDiagram(text: string): Set<string> {
  const lines = text.split('\n');
  const edges = new Set<string>();
  const stateRe = new RegExp(`\\b(${ALL_STATES.join('|')})\\b`, 'g');
  const clean = (l: string) =>
    l.replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)/g, (m) => ' '.repeat(m.length));
  const tokens = (l: string) =>
    [...clean(l).matchAll(stateRe)].map((m) => ({ name: m[1], col: m.index ?? 0 }));
  const sourceAt = (idx: number, col: number): string | null => {
    for (let i = idx - 1; i >= 0; i--) {
      const t = tokens(lines[i]).filter((x) => x.col <= col);
      if (t.length) return t[t.length - 1].name;
    }
    return null;
  };
  let group = false;
  lines.forEach((raw, idx) => {
    if (!raw.trim()) return;
    if (raw.startsWith('Любое из')) {
      group = true;
      return;
    }
    const arrowLed = /^\s*(?:│\s*)*(?:└─|──)/.exec(raw);
    const v = raw.indexOf('▼');
    if (v >= 0) {
      const src = sourceAt(idx, v);
      for (let j = idx + 1; j < lines.length; j++) {
        const t = tokens(lines[j]);
        if (t.length) {
          if (src) edges.add(`${src}->${t[0].name}`);
          break;
        }
      }
      return;
    }
    if (!/[►→]/.test(raw)) return;
    if (!/^[A-Z_]+\b/.test(raw)) {
      // continuation: arrow-led line
    } else group = false;
    let sources: string[] = [];
    if (arrowLed) {
      const col = raw.search(/└─|──/);
      if (group && !raw.includes('└')) sources = [...ACTIVE_STATES];
      else {
        const s = sourceAt(idx, col);
        if (s) sources = [s];
      }
    }
    const body = clean(raw);
    const segs = body.split(/[►→]/);
    segs.forEach((seg, i) => {
      const toks = [...seg.matchAll(stateRe)].map((m) => m[1]);
      if (i === 0) {
        if (toks.length) sources = [toks[toks.length - 1]];
        return;
      }
      const targets: string[] = [...toks];
      if (/продолжает путь|возвращается в прежнее состояние/.test(seg))
        targets.push(...ACTIVE_STATES);
      for (const s of sources) for (const t of targets) edges.add(`${s}->${t}`);
      // next arrow starts from the last token of this segment (if it names one)
      if (toks.length) sources = [toks[toks.length - 1]];
    });
  });
  return edges;
}
