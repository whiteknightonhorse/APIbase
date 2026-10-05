const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');

const slug = (s: string) =>
  s
    .replace(/`/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Minimal Markdown -> HTML for the fixed integrator guides: headings (with ids), fences, lists, paragraphs. */
export function mdToHtml(md: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  let fence: string[] | null = null;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith('```')) {
      if (fence) {
        out.push(`<pre>${esc(fence.join('\n'))}</pre>`);
        fence = null;
      } else {
        flush();
        close();
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }
    const h = /^(#{1,3}) (.+)$/.exec(line);
    const li = /^(?:- |(\d+)\. )(.+)$/.exec(line);
    if (h) {
      flush();
      close();
      out.push(`<h${h[1].length} id="${slug(h[2])}">${inline(h[2])}</h${h[1].length}>`);
    } else if (li) {
      flush();
      const kind = li[1] ? 'ol' : 'ul';
      if (list !== kind) {
        close();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline(li[2])}</li>`);
    } else if (!line.trim()) {
      flush();
      close();
    } else para.push(line.trim());
  }
  flush();
  close();
  return out.join('\n');
}

export const titleOf = (md: string): string => /^# (.+)$/m.exec(md)?.[1] ?? 'APIbase Integrator';
