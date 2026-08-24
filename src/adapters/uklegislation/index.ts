import { logger } from '../../config/logger';
import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_TIMEOUT_MS,
  PROVIDER_BACKOFF_BASE_MS,
  PROVIDER_MAX_RETRIES,
} from '../../types/provider';
import type {
  UkLegSearchItem,
  UkLegSearchOutput,
  UkLegDetailsOutput,
  UkLegSection,
  UkLegRecentItem,
  UkLegRecentOutput,
  UkLegSectionsOutput,
} from './types';

const BASE = 'https://www.legislation.gov.uk';

// Map internal type codes to display labels
const TYPE_LABELS: Record<string, string> = {
  ukpga: 'UK Public General Act',
  uksi: 'UK Statutory Instrument',
  asp: 'Act of the Scottish Parliament',
  asc: 'Act of Senedd Cymru',
  anaw: 'Act of the National Assembly for Wales',
  nia: 'Act of the Northern Ireland Assembly',
  ukdsi: 'UK Draft Statutory Instrument',
  ukcm: 'Church Measure',
  nisi: 'Northern Ireland Order in Council',
  ukla: 'UK Local Act',
  wsi: 'Welsh Statutory Instrument',
  ssi: 'Scottish Statutory Instrument',
  nisr: 'Northern Ireland Statutory Rule',
};

function extractAttr(tag: string, attr: string): string | undefined {
  const m = new RegExp(`${attr}="([^"]+)"`).exec(tag);
  return m ? m[1] : undefined;
}

function xmlText(xml: string, tag: string): string | null {
  // Handle namespace-prefixed tags by stripping prefix
  const bare = tag.includes(':') ? tag.split(':')[1] : tag;
  const m = new RegExp(`<(?:[a-z]+:)?${bare}[^>]*>([\\s\\S]*?)<\\/(?:[a-z]+:)?${bare}>`, 'i').exec(
    xml,
  );
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

const XML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
};

function decodeXmlEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m, ent) => XML_ENTITY_MAP[ent] ?? m);
}

function parseAtomEntry(entry: string): {
  title: string;
  type: string;
  year: number;
  number: number;
  url: string;
  id_url: string;
  summary: string | null;
  enacted: string | null;
  updated: string;
  categories: string[];
} {
  const titleRaw = xmlText(entry, 'title') ?? '';
  const title = decodeXmlEntities(titleRaw);
  const idUrl = (xmlText(entry, 'id') ?? '').replace(/^http:\/\//, 'https://');

  // Extract type/year/number from id URL: /id/{type}/{year}/{number}
  const idParts = idUrl.match(/\/id\/([a-z]+)\/(\d+)\/(\d+)/);
  const type = idParts ? idParts[1] : '';
  const year = idParts ? parseInt(idParts[2], 10) : 0;
  const number = idParts ? parseInt(idParts[3], 10) : 0;
  const url = `${BASE}/${type}/${year}/${number}/contents`;

  // Summary / description
  const summaryRaw = xmlText(entry, 'summary') ?? null;
  const summary = summaryRaw ? decodeXmlEntities(summaryRaw).slice(0, 600) : null;

  // Dates
  const enacted = extractAttr(entry.match(/<ukm:CreationDate[^>]+>/)?.[0] ?? '', 'Date') ?? null;
  const updatedRaw = xmlText(entry, 'updated') ?? '';
  const updated = updatedRaw.split('T')[0] ?? '';

  // Categories
  const categories: string[] = [];
  const catRegex = /<category term="([^"]+)"/g;
  let catMatch: RegExpExecArray | null;
  while ((catMatch = catRegex.exec(entry)) !== null) {
    categories.push(decodeXmlEntities(catMatch[1]));
  }

  return { title, type, year, number, url, id_url: idUrl, summary, enacted, updated, categories };
}

function parseAtomFeed(xml: string): {
  total: number;
  page: number;
  items_per_page: number;
  more_pages: number;
  entries: ReturnType<typeof parseAtomEntry>[];
} {
  const totalM = /<openSearch:totalResults>(\d+)<\/openSearch:totalResults>/.exec(xml);
  const pageM = /<leg:page>(\d+)<\/leg:page>/.exec(xml);
  const perPageM = /<openSearch:itemsPerPage>(\d+)<\/openSearch:itemsPerPage>/.exec(xml);
  const morePagesM = /<leg:morePages>(\d+)<\/leg:morePages>/.exec(xml);

  const total = totalM ? parseInt(totalM[1], 10) : 0;
  const page = pageM ? parseInt(pageM[1], 10) : 1;
  const itemsPerPage = perPageM ? parseInt(perPageM[1], 10) : 20;
  const morePages = morePagesM ? parseInt(morePagesM[1], 10) : 1;

  const entries: ReturnType<typeof parseAtomEntry>[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(xml)) !== null) {
    try {
      entries.push(parseAtomEntry(m[1]));
    } catch {
      // Skip malformed entries
    }
  }

  return { total, page, items_per_page: itemsPerPage, more_pages: morePages, entries };
}

function parseTocXml(xml: string): {
  title: string;
  type: string;
  year: number;
  number: number;
  status: string | null;
  enacted: string | null;
  modified: string | null;
  body_paragraphs: number | null;
  schedule_paragraphs: number | null;
  extent: string | null;
  sections: UkLegSection[];
} {
  const title = decodeXmlEntities(xml.match(/<dc:title>([^<]+)<\/dc:title>/)?.[1] ?? '');
  const type = extractAttr(xml.match(/<ukm:DocumentMainType[^>]+>/)?.[0] ?? '', 'Value') ?? '';
  const year = parseInt(extractAttr(xml.match(/<ukm:Year[^>]+>/)?.[0] ?? '', 'Value') ?? '0', 10);
  const number = parseInt(
    extractAttr(xml.match(/<ukm:Number[^>]+>/)?.[0] ?? '', 'Value') ?? '0',
    10,
  );
  const status = extractAttr(xml.match(/<ukm:DocumentStatus[^>]+>/)?.[0] ?? '', 'Value') ?? null;
  const enacted = extractAttr(xml.match(/<ukm:EnactmentDate[^>]+>/)?.[0] ?? '', 'Date') ?? null;
  const modified = xml.match(/<dc:modified>([^<]+)<\/dc:modified>/)?.[1] ?? null;
  const bodyParaRaw = extractAttr(xml.match(/<ukm:BodyParagraphs[^>]+>/)?.[0] ?? '', 'Value');
  const schedParaRaw = extractAttr(xml.match(/<ukm:ScheduleParagraphs[^>]+>/)?.[0] ?? '', 'Value');

  const body_paragraphs = bodyParaRaw ? parseInt(bodyParaRaw, 10) : null;
  const schedule_paragraphs = schedParaRaw ? parseInt(schedParaRaw, 10) : null;

  // Extent from Legislation root element
  const extentMatch = xml.match(/RestrictExtent="([^"]+)"/);
  const extent = extentMatch ? extentMatch[1] : null;

  // Parse ContentsItem sections
  const sections: UkLegSection[] = [];
  const itemRegex =
    /<ContentsItem[^>]*ContentRef="([^"]+)"[^>]*DocumentURI="([^"]+)"[^>]*>([\s\S]*?)<\/ContentsItem>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const contentRef = m[1];
    const docUri = m[2].replace(/^http:\/\//, 'https://');
    const inner = m[3];
    const numRaw = inner.match(/<ContentsNumber>([^<]*)<\/ContentsNumber>/)?.[1] ?? '';
    const titleRaw = inner.match(/<ContentsTitle>([^<]*)<\/ContentsTitle>/)?.[1] ?? '';
    // Derive section type from ContentRef prefix
    const refType = contentRef.split('-')[0] ?? 'section';
    sections.push({
      type: refType,
      number: decodeXmlEntities(numRaw).trim(),
      title: decodeXmlEntities(titleRaw).trim(),
      url: docUri,
    });
  }

  return {
    title,
    type,
    year,
    number,
    status,
    enacted,
    modified,
    body_paragraphs,
    schedule_paragraphs,
    extent,
    sections,
  };
}

export class UkLegislationAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'uklegislation', baseUrl: BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers = { 'User-Agent': 'APIbase.pro/1.0 (legal data service; contact@apibase.pro)' };

    switch (req.toolId) {
      case 'ukleg.legislation.search': {
        const qp = new URLSearchParams();
        if (p.title) qp.set('title', String(p.title));
        if (p.type) qp.set('type', String(p.type));
        if (p.year) qp.set('year', String(p.year));
        if (p.page) qp.set('page', String(p.page));
        return { url: `${BASE}/search/data.feed?${qp}`, method: 'GET', headers };
      }

      case 'ukleg.legislation.details':
      case 'ukleg.legislation.sections': {
        const type = encodeURIComponent(String(p.type ?? 'ukpga'));
        const year = encodeURIComponent(String(p.year ?? ''));
        const number = encodeURIComponent(String(p.number ?? ''));
        return {
          url: `${BASE}/${type}/${year}/${number}/contents/data.xml`,
          method: 'GET',
          headers,
        };
      }

      case 'ukleg.legislation.recent': {
        const qp = new URLSearchParams();
        const legType = p.type ? String(p.type) : 'primary';
        qp.set('sort', 'published');
        if (legType !== 'any') qp.set('type', legType);
        const limit = Math.min(Number(p.limit) || 10, 20);
        qp.set('legs', String(limit));
        return { url: `${BASE}/new/data.feed?${qp}`, method: 'GET', headers };
      }

      default:
        throw {
          code: ProviderErrorCode.INPUT_REJECTED,
          httpStatus: 422,
          message: `Unknown tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    // raw.body is already parsed XML (set by our overridden call())
    return raw.body;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const built = this.buildRequest(req);
    let lastError: unknown;

    for (let attempt = 0; attempt <= PROVIDER_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delayMs = PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delayMs));
        logger.info(
          { provider: this.provider, tool_id: req.toolId, attempt: attempt + 1 },
          'Retrying UK Legislation call',
        );
      }

      const start = performance.now();
      try {
        const response = await fetch(built.url, {
          method: built.method,
          headers: built.headers,
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });

        const xmlText = await response.text();
        const durationMs = Math.round(performance.now() - start);
        const byteLength = Buffer.byteLength(xmlText, 'utf8');

        if (response.status === 429) {
          throw {
            code: ProviderErrorCode.RATE_LIMIT,
            httpStatus: 429,
            message: 'UK Legislation rate limit exceeded',
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        if (response.status >= 500) {
          throw {
            code: ProviderErrorCode.UNAVAILABLE,
            httpStatus: 502,
            message: `UK Legislation service unavailable (HTTP ${response.status})`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        if (response.status >= 400) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `UK Legislation rejected request (HTTP ${response.status}): check type/year/number params`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        const parsed = this.parseXml(xmlText, req);
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          headers[k] = v;
        });

        return { status: response.status, headers, body: parsed, durationMs, byteLength };
      } catch (error) {
        lastError = error;
        const pe = error as { code?: string };
        if (pe.code !== ProviderErrorCode.TIMEOUT && pe.code !== ProviderErrorCode.UNAVAILABLE) {
          throw error;
        }
      }
    }
    throw lastError;
  }

  private parseXml(xml: string, req: ProviderRequest): unknown {
    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'ukleg.legislation.search': {
        const feed = parseAtomFeed(xml);
        const result: UkLegSearchOutput = {
          total_results: feed.total,
          page: feed.page,
          items_per_page: feed.items_per_page,
          has_more: feed.more_pages > feed.page,
          legislation: feed.entries.map(
            (e): UkLegSearchItem => ({
              title: e.title,
              type: TYPE_LABELS[e.type] ?? e.type,
              year: e.year,
              number: e.number,
              url: e.url,
              id_url: e.id_url,
              summary: e.summary,
              enacted: e.enacted,
              updated: e.updated,
              categories: e.categories,
            }),
          ),
        };
        return result;
      }

      case 'ukleg.legislation.details': {
        const toc = parseTocXml(xml);
        const result: UkLegDetailsOutput = {
          ...toc,
          type: TYPE_LABELS[toc.type] ?? toc.type,
          url: `${BASE}/${p.type}/${p.year}/${p.number}/contents`,
          id_url: `${BASE}/id/${p.type}/${p.year}/${p.number}`,
        };
        return result;
      }

      case 'ukleg.legislation.sections': {
        const toc = parseTocXml(xml);
        const result: UkLegSectionsOutput = {
          title: toc.title,
          type: TYPE_LABELS[toc.type] ?? toc.type,
          year: toc.year,
          number: toc.number,
          sections: toc.sections,
          section_count: toc.sections.length,
        };
        return result;
      }

      case 'ukleg.legislation.recent': {
        const feed = parseAtomFeed(xml);
        const result: UkLegRecentOutput = {
          legislation: feed.entries.map(
            (e): UkLegRecentItem => ({
              title: e.title,
              type: TYPE_LABELS[e.type] ?? e.type,
              year: e.year,
              number: e.number,
              url: e.url,
              updated: e.updated,
              enacted: e.enacted,
              summary: e.summary,
            }),
          ),
        };
        return result;
      }

      default:
        return {};
    }
  }
}
