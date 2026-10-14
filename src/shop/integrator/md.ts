const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SITE_PATH =
  /(?<![\w/.:%-])\/(?:integrator|legal|pricing|guides|catalog|shops|dashboard|contact|onboard|m(?=\/))(?![\w])[\w\-./#]*/g;
const SKIP_SEGMENT =
  /(<a\b[^>]*>[\s\S]*?<\/a>|<code>[\s\S]*?<\/code>|<pre>[\s\S]*?<\/pre>|<[^>]+>)/;

/** Wrap bare site paths in prose with <a>, leaving anchors, code, pre and tags untouched. */
export const autolinkSitePaths = (html: string): string =>
  html
    .split(SKIP_SEGMENT)
    .map((seg, i) =>
      i % 2
        ? seg
        : seg.replace(SITE_PATH, (m) => {
            const path = m.replace(/[.,;:\-]+$/, '');
            return `<a href="${path}">${path}</a>${m.slice(path.length)}`;
          }),
    )
    .join('');

const inline = (s: string) =>
  autolinkSitePaths(
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>'),
  );

const slug = (s: string) =>
  s
    .replace(/`/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '');

export interface TocItem {
  level: 2 | 3;
  id: string;
  text: string;
}

interface Doc {
  h1: string;
  body: string;
  toc: TocItem[];
}

const ERRORS_H = /^(?:errors?|error codes)$/i;
const ANCHOR = /^<a id="([a-z0-9_-]+)"><\/a>$/;
const COPY_JS =
  "var p=this.closest('.dx-code').querySelector('pre'),b=this;navigator.clipboard&&navigator.clipboard.writeText(p.textContent).then(function(){b.lastChild.textContent='Copied';setTimeout(function(){b.lastChild.textContent='Copy'},1800)})";
const COPY_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2"></rect><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"></path></svg>';

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

const plain = (s: string) => s.replace(/`/g, '');

function parse(md: string): Doc {
  const out: string[] = [];
  const toc: TocItem[] = [];
  let h1 = '';
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  let fence: string[] | null = null;
  let lang = '';
  let table: string[] = [];
  // Error sections render as a grid of cards: `## Error codes` + one `###` per code, or the
  // bold-code paragraphs under `### Errors`.
  let errLevel = 0;
  let grid = false;
  let card = false;
  let anchors = '';

  const closeCard = () => {
    if (card) out.push('</div>');
    card = false;
  };
  const closeGrid = () => {
    closeCard();
    if (grid) out.push('</div>');
    grid = false;
  };
  const openGrid = () => {
    if (!grid) out.push('<div class="dx-errs">');
    grid = true;
  };
  const flush = () => {
    if (!para.length) return;
    const html = inline(para.join(' '));
    para = [];
    if (errLevel === 3 && html.startsWith('<strong><code>')) {
      openGrid();
      out.push(`<div class="dx-err">${anchors}<p>${html}</p></div>`);
      anchors = '';
      return;
    }
    if (errLevel !== 2) closeGrid();
    out.push(`${anchors}<p>${html}</p>`);
    anchors = '';
  };
  let fenceIndent = 0;
  // The open step's first text line (index in `out` + raw text): unblanked indented lines extend it.
  let stepIdx = -1;
  let stepRaw = '';
  const close = () => {
    if (list) out.push(list === 'ol' ? '</div></li></ol>' : `</${list}>`);
    list = null;
  };
  const flushTable = () => {
    if (!table.length) return;
    const head = cells(table[0]);
    const rows = table.slice(2).map(cells);
    const th = head.map((c) => `<th scope="col">${inline(c)}</th>`).join('');
    const trs = rows
      .map(
        (r) =>
          `<tr>${r.map((c, i) => `<td data-label="${esc(plain(head[i] ?? ''))}">${inline(c)}</td>`).join('')}</tr>`,
      )
      .join('');
    out.push(
      `<div class="m-table-wrap"><table class="m-table m-table--cards"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`,
    );
    table = [];
  };

  for (const raw of md.split(/\r?\n/)) {
    // Indented lines under a numbered step belong to that step (continuation text, fences).
    const lead = raw.length - raw.trimStart().length;
    const inStep = list === 'ol' && !fence && lead >= 2 && raw.trim() !== '';
    const line = inStep ? raw.slice(Math.min(lead, 3)) : raw;
    if (fence ? raw.trimStart().startsWith('```') : line.startsWith('```')) {
      if (fence) {
        out.push(
          `<div class="dx-code"><div class="dx-code-bar"><span>${esc(lang || 'text')}</span><button type="button" class="dx-copy" onclick="${COPY_JS}">${COPY_ICON}<span>Copy</span></button></div><pre>${esc(fence.join('\n'))}</pre></div>`,
        );
        fence = null;
      } else {
        flush();
        stepIdx = -1;
        if (!inStep) close();
        flushTable();
        fence = [];
        fenceIndent = inStep ? Math.min(lead, 3) : 0;
        lang = line.slice(3).trim();
      }
      continue;
    }
    if (fence) {
      fence.push(raw.slice(Math.min(fenceIndent, raw.length - raw.trimStart().length)));
      continue;
    }
    if (list === 'ol' && raw.trim() && !inStep && !/^\d+\. /.test(raw)) close();
    if (line.startsWith('|')) {
      flush();
      close();
      table.push(line);
      continue;
    }
    flushTable();
    const h = /^(#{1,3}) (.+)$/.exec(line);
    const li = /^(?:- |(\d+)\. )(.+)$/.exec(line);
    const anchor = ANCHOR.exec(line.trim());
    if (h) {
      flush();
      close();
      // `## Title {#id}` pins the anchor (the API error links use /integrator#pii).
      const pin = /^(.*?)\s*\{#([a-z0-9_-]+)\}$/.exec(h[2]);
      const text = pin ? pin[1] : h[2];
      const level = h[1].length;
      const id = pin ? pin[2] : slug(text);
      if (errLevel && level <= errLevel) {
        closeGrid();
        errLevel = 0;
      }
      const inCards = errLevel === 2 && level === 3;
      if (inCards) {
        openGrid();
        closeCard();
        out.push('<div class="dx-err">');
        card = true;
      }
      if (level > 1 && ERRORS_H.test(plain(text))) errLevel = level;
      if (level === 1 && !h1) h1 = `<h1 id="${id}">${inline(text)}</h1>`;
      else out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      if (level > 1 && !inCards) toc.push({ level: level as 2 | 3, id, text: plain(text) });
    } else if (anchor) {
      flush();
      close();
      anchors += `<a id="${anchor[1]}"></a>`;
    } else if (li) {
      flush();
      const kind = li[1] ? 'ol' : 'ul';
      if (list === 'ol' && kind === 'ol') out.push('</div></li>');
      if (list !== kind) {
        close();
        out.push(kind === 'ol' ? '<ol class="dx-steps">' : '<ul>');
        list = kind;
      }
      out.push(
        kind === 'ol'
          ? `<li><div class="dx-step-body">${inline(li[2])}`
          : `<li>${inline(li[2])}</li>`,
      );
      stepIdx = kind === 'ol' ? out.length - 1 : -1;
      stepRaw = li[2];
    } else if (!line.trim()) {
      flush();
      stepIdx = -1;
      if (list !== 'ol') close();
    } else if (inStep && stepIdx >= 0 && !para.length) {
      stepRaw += ` ${line.trim()}`;
      out[stepIdx] = `<li><div class="dx-step-body">${inline(stepRaw)}`;
    } else para.push(line.trim());
  }
  flush();
  close();
  flushTable();
  closeGrid();
  return { h1, body: out.join('\n'), toc };
}

const tocLinks = (toc: TocItem[]): string =>
  toc.map((t) => `<a class="l${t.level}" href="#${t.id}">${esc(t.text)}</a>`).join('');

/**
 * Minimal Markdown -> HTML for the fixed integrator guides, laid out as a docs page: title,
 * sticky table of contents (collapsible on phones) and the article (headings with ids, fences with
 * a copy button, numbered steps, tables, error cards).
 */
export function docToHtml(md: string): string {
  const d = parse(md);
  const nav = d.toc.length >= 3 ? tocLinks(d.toc) : '';
  const side = nav
    ? `<aside class="dx-side"><nav class="dx-toc" aria-label="On this page"><span class="m-caption">On this page</span>${nav}</nav></aside>`
    : '';
  const fold = nav
    ? `<details class="dx-fold"><summary>On this page</summary><nav class="dx-toc" aria-label="On this page, short list">${nav}</nav></details>`
    : '';
  return `<div class="dx">\n${d.h1}\n<div class="dx-grid${nav ? ' has-toc' : ''}">${side}<article class="dx-main">${fold}\n${d.body}\n</article></div></div>`;
}

/** First prose paragraph of a Markdown guide as plain text (meta description source). */
export const leadOf = (md: string): string => {
  for (const block of md.split(/\r?\n\s*\r?\n/)) {
    const t = block.trim();
    if (t && !/^(#|```|[-*] |\d+\. |\||<)/.test(t)) {
      return t
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[`*_]/g, '')
        .replace(/\s+/g, ' ');
    }
  }
  return '';
};

export const titleOf = (md: string): string => /^# (.+)$/m.exec(md)?.[1] ?? 'APIbase Integrator';
