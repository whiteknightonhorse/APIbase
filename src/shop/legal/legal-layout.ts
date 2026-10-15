const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const stripTags = (h: string): string => {
  let text = h;
  for (;;) {
    const open = text.indexOf('<');
    const close = open === -1 ? -1 : text.indexOf('>', open);
    if (close === -1) return text;
    text = text.slice(0, open) + text.slice(close + 1);
  }
};

export interface LegalToc {
  id: string;
  text: string;
}

/** Design M document layout (T-0387): the h1 leaves the body, every h2 gets a unique id and the
 *  table of contents is built from those real headings. The rendered text itself is unchanged. */
export function legalDocLayout(bodyHtml: string): { h1: string; content: string; toc: LegalToc[] } {
  const h1m = /<h1>[\s\S]*?<\/h1>/.exec(bodyHtml);
  const h1 = h1m ? h1m[0] : '';
  const rest = h1m ? bodyHtml.replace(h1, '') : bodyHtml;
  const toc: LegalToc[] = [];
  const seen = new Set<string>();
  const content = rest.replace(/<h2>([\s\S]*?)<\/h2>/g, (_m, inner: string) => {
    const base =
      stripTags(inner)
        .toLowerCase()
        .replace(/&[a-z]+;/g, ' ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';
    let id = base;
    for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
    seen.add(id);
    toc.push({ id, text: inner });
    return `<h2 id="${id}">${inner}</h2>`;
  });
  return { h1, content, toc };
}

/** The page body between the shared header and footer: breadcrumb, h1, version and effective badges,
 *  sticky contents (wide screens) or a collapsible one (narrow), and the sections in a 70ch column. */
export function legalDocumentHtml(
  docTitle: string,
  bodyHtml: string,
  meta: { version: string; effective: string },
): string {
  const { h1, content, toc } = legalDocLayout(bodyHtml);
  const links = toc.map((t) => `<a href="#${t.id}">${t.text}</a>`).join('');
  const side = toc.length
    ? `<aside class="lg-side"><nav class="lg-toc" aria-label="On this page"><span class="lg-toc-h">On this page</span>${links}</nav></aside>`
    : '';
  const narrow = toc.length
    ? `<details class="lg-toc-narrow"><summary>On this page</summary><nav class="lg-toc" aria-label="On this page">${links}</nav></details>`
    : '';
  return (
    '<div class="page-shell"><main class="container lg" id="main-content">' +
    `<nav class="lg-crumb" aria-label="Breadcrumb"><ol class="m-breadcrumb"><li><a href="/">Home</a></li><li>Legal</li><li aria-current="page">${esc(docTitle)}</li></ol></nav>` +
    `${h1}<p class="updated"><span class="lg-badge">Version ${esc(meta.version)}</span><span class="lg-badge">Effective ${esc(meta.effective)}</span></p>` +
    `<div class="lg-layout">${side}<div class="lg-doc">${narrow}${content}</div></div>` +
    '</main></div>'
  );
}
