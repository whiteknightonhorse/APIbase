import { FeedError } from './feed-fetch';

/** One feed record mapped to the F-2 item shape (validated later by `upsertCatalog`), or refused here. */
export interface Parsed {
  items: Array<Record<string, unknown>>;
  rejected: Array<{ sku: string; reason: string }>;
}

const EMPTY = (): Parsed => ({ items: [], rejected: [] });

// --- CSV (our F-2 schema) ---------------------------------------------------------------------

/** RFC 4180: quoted fields, doubled quotes, CRLF/LF, optional BOM. */
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (quoted) throw new FeedError('malformed CSV: unterminated quoted field');
  row.push(field);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

const BOOL_COLUMNS = ['tax_included', 'returns_accepted'];
const INT_COLUMNS = ['stock', 'refund_window_days'];
const TEXT_COLUMNS = [
  'sku',
  'title',
  'description',
  'price_usd',
  'category',
  'currency_display',
  'fulfillment_mode',
  'tax_note',
];

export function parseCsv(text: string, defaultCategory?: string): Parsed {
  const rows = csvRows(text);
  if (rows.length === 0) throw new FeedError('CSV is empty');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  for (const need of ['sku', 'title', 'price_usd']) {
    if (!header.includes(need)) throw new FeedError(`CSV header must contain the column ${need}`);
  }
  const out = EMPTY();
  rows.slice(1).forEach((cells, n) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => {
      rec[h] = (cells[i] ?? '').trim();
    });
    const item: Record<string, unknown> = {};
    for (const c of TEXT_COLUMNS) if (rec[c]) item[c] = rec[c];
    for (const c of INT_COLUMNS) {
      if (rec[c] === undefined || rec[c] === '') continue;
      item[c] = /^\d+$/.test(rec[c]) ? Number(rec[c]) : rec[c]; // non-numeric stays a string: zod refuses it
    }
    for (const c of BOOL_COLUMNS) {
      if (rec[c]) item[c] = /^(true|1|yes)$/i.test(rec[c]);
    }
    if (rec.images)
      item.images = rec.images
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
    if (!item.category && defaultCategory) item.category = defaultCategory;
    if (!item.category) item.category = 'uncategorized';
    if (!item.sku) {
      out.rejected.push({ sku: `row ${n + 2}`, reason: 'sku is missing' });
      return;
    }
    out.items.push(item);
  });
  return out;
}

// --- Google Merchant Center RSS 2.0 / Atom ---------------------------------------------------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function xmlText(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  if (cdata) return cdata[1].trim();
  return raw
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
      if (e[0] !== '#') return ENTITIES[e.toLowerCase()];
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    })
    .trim();
}

function xmlField(block: string, name: string): string | undefined {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(block);
  return m ? xmlText(m[1]) : undefined;
}

/** The `price_usd` of a `g:price` such as "12.50 USD", or the reason it is refused (USD only). */
function gmcPrice(raw: string | undefined): { price: string } | { reason: string } {
  if (!raw) return { reason: 'g:price is missing' };
  const m = /^(\d+(?:\.\d+)?)\s+([A-Za-z]{3})$/.exec(raw);
  if (!m) return { reason: `g:price "${raw}" is not "<amount> USD"` };
  if (m[2].toUpperCase() !== 'USD') {
    return { reason: `g:price currency ${m[2].toUpperCase()} is not supported (USD only)` };
  }
  return { price: m[1] };
}

/**
 * Plain scanner, no DTD or entity expansion (XML bombs and XXE have nothing to work with); a
 * document that declares a DOCTYPE or ENTITY is refused outright.
 */
export function parseGmc(xml: string, defaultCategory?: string): Parsed {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new FeedError('XML with a DOCTYPE or ENTITY is refused');
  const out = EMPTY();
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)];
  if (blocks.length === 0) throw new FeedError('no <item> elements found in the feed');
  blocks.forEach((b, n) => {
    const block = b[2];
    const id = xmlField(block, 'g:id');
    const sku = id ?? `item ${n + 1}`;
    if (!id) {
      out.rejected.push({ sku, reason: 'g:id is missing' });
      return;
    }
    const price = gmcPrice(xmlField(block, 'g:price'));
    if ('reason' in price) {
      out.rejected.push({ sku, reason: price.reason });
      return;
    }
    const availability = (xmlField(block, 'g:availability') ?? '')
      .toLowerCase()
      .replace(/[_\s]+/g, ' ');
    let stock: number | null;
    if (availability === 'in stock') stock = null;
    else if (['out of stock', 'preorder', 'backorder'].includes(availability)) stock = 0;
    else {
      out.rejected.push({ sku, reason: `g:availability "${availability}" is not recognised` });
      return;
    }
    const image = xmlField(block, 'g:image_link');
    out.items.push({
      sku: id,
      title: xmlField(block, 'g:title') ?? xmlField(block, 'title') ?? '',
      description: xmlField(block, 'g:description') ?? xmlField(block, 'description') ?? '',
      price_usd: price.price,
      stock,
      category:
        xmlField(block, 'g:product_type') ??
        xmlField(block, 'g:google_product_category') ??
        defaultCategory ??
        'uncategorized',
      ...(image ? { images: [image] } : {}),
    });
  });
  return out;
}

// --- Shopify /products.json --------------------------------------------------------------------

type J = Record<string, unknown>;
const str = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';

/** Variant SKU: Shopify's own when it is usable, else its id. */
const variantSku = (v: J, productId: string, i: number): string => {
  const own = str(v.sku).trim();
  return /^[A-Za-z0-9._:-]{1,64}$/.test(own) ? own : `v${str(v.id) || `${productId}-${i + 1}`}`;
};

export function parseShopify(pages: unknown[], defaultCategory?: string): Parsed {
  const out = EMPTY();
  for (const page of pages) {
    const products = (page as { products?: unknown } | null)?.products;
    if (!Array.isArray(products)) throw new FeedError('Shopify response has no products array');
    products.forEach((raw, n) => {
      const p = (raw ?? {}) as J;
      const id = str(p.id) || str(p.handle);
      const sku = id ? `p${id}` : `product ${n + 1}`;
      const variants = Array.isArray(p.variants) ? (p.variants as J[]) : [];
      if (!id || variants.length === 0) {
        out.rejected.push({
          sku,
          reason: id ? 'product has no variants' : 'product id is missing',
        });
        return;
      }
      const optionNames = Array.isArray(p.options)
        ? (p.options as J[]).map((o) => str(o.name))
        : [];
      const mapped = variants.map((v, i) => {
        const attributes: Record<string, string> = {};
        ['option1', 'option2', 'option3'].forEach((k, j) => {
          const val = str(v[k]);
          if (val) attributes[optionNames[j] || k] = val;
        });
        return {
          sku: variantSku(v, id, i),
          title: str(v.title) || `Variant ${i + 1}`,
          price_usd: str(v.price),
          stock: v.available === false ? 0 : null,
          attributes,
        };
      });
      const prices = mapped.map((v) => Number(v.price_usd)).filter((x) => Number.isFinite(x));
      const images = (Array.isArray(p.images) ? (p.images as J[]) : [])
        .map((im) => str(im.src))
        .filter((s) => s.startsWith('https://'))
        .slice(0, 10);
      out.items.push({
        sku,
        title: str(p.title),
        description: str(p.body_html),
        price_usd: prices.length > 0 ? String(Math.min(...prices)) : '',
        stock: mapped.every((v) => v.stock === 0) ? 0 : null,
        category: str(p.product_type).trim() || defaultCategory || 'uncategorized',
        images,
        variants: mapped,
      });
    });
  }
  return out;
}
