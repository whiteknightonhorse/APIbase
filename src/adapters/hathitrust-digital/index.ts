import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  HathiTrustVolumesResponse,
  HathiTrustQueryResult,
  HathiTrustBriefRecord,
  HathiTrustItem,
  HathiTrustRecordSummary,
  HathiTrustItemSummary,
  HathiTrustLookupOutput,
  HathiTrustBatchLookupOutput,
  HathiTrustFullRecordOutput,
  HathiTrustMarcFields,
} from './types';

const HATHITRUST_BASE = 'https://catalog.hathitrust.org';
const ID_TYPES = ['oclc', 'isbn', 'issn', 'lccn', 'htid', 'recordnumber'] as const;
type HathiTrustIdType = (typeof ID_TYPES)[number];
const MAX_BATCH_IDS = 10;

interface BatchId {
  id_type: string;
  id_value: string;
}

/**
 * HathiTrust Digital Library Bibliographic API adapter (UC-679).
 *
 * Supported tools:
 *   hathitrust-digital.lookup_by_id    -> /api/volumes/brief/json/{id}  brief record + item availability
 *   hathitrust-digital.get_full_record -> /api/volumes/full/json/{id}   brief + MARC-XML-derived detail
 *   hathitrust-digital.batch_lookup    -> /api/volumes/brief/json/{a}|{b}|...  up to 10 ids in one call
 *
 * Auth: None. Fully open Bibliographic API, no API key, no registration.
 * Docs: https://www.hathitrust.org/data/bib-api/
 *
 * Quirk (see types.ts header): the upstream serializes an empty match set as
 * `[]` instead of `{}` for `records`/keyed fields — every parse path here
 * normalizes through `asRecordMap()`/`asArray()` rather than assuming an
 * object shape.
 */
export class HathiTrustDigitalAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'hathitrust-digital', baseUrl: HATHITRUST_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'hathitrust-digital.lookup_by_id': {
        const id = this.buildIdSegment(req.toolId, params.id_type, params.id_value);
        return { url: `${HATHITRUST_BASE}/api/volumes/brief/json/${id}`, method: 'GET', headers };
      }

      case 'hathitrust-digital.get_full_record': {
        const id = this.buildIdSegment(req.toolId, params.id_type, params.id_value);
        return { url: `${HATHITRUST_BASE}/api/volumes/full/json/${id}`, method: 'GET', headers };
      }

      case 'hathitrust-digital.batch_lookup': {
        const rawIds = params.ids;
        if (!Array.isArray(rawIds) || rawIds.length === 0) {
          throw this.invalidInput(
            req.toolId,
            'ids is required (array of 1-10 {id_type, id_value})',
          );
        }
        if (rawIds.length > MAX_BATCH_IDS) {
          throw this.invalidInput(req.toolId, `ids must contain at most ${MAX_BATCH_IDS} entries`);
        }
        const segments = (rawIds as BatchId[]).map((entry) =>
          this.buildIdSegment(req.toolId, entry?.id_type, entry?.id_value),
        );
        return {
          url: `${HATHITRUST_BASE}/api/volumes/brief/json/${segments.join('|')}`,
          method: 'GET',
          headers,
        };
      }

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as HathiTrustVolumesResponse;
    switch (req.toolId) {
      case 'hathitrust-digital.lookup_by_id':
        return this.parseSingle(body);
      case 'hathitrust-digital.get_full_record':
        return this.parseFullRecord(body);
      case 'hathitrust-digital.batch_lookup':
        return this.parseBatch(body);
      default:
        return body;
    }
  }

  /** Validate id_type/id_value and build the `{type}:{urlencoded value}` path segment. */
  private buildIdSegment(toolId: string, rawType: unknown, rawValue: unknown): string {
    const idType = String(rawType || '')
      .trim()
      .toLowerCase();
    const idValue = String(rawValue || '').trim();
    if (!ID_TYPES.includes(idType as HathiTrustIdType)) {
      throw this.invalidInput(toolId, `id_type must be one of: ${ID_TYPES.join(', ')}`);
    }
    if (!idValue) {
      throw this.invalidInput(toolId, 'id_value is required');
    }
    return `${idType}:${encodeURIComponent(idValue)}`;
  }

  /** Normalize the upstream's `{}` (matches) vs `[]` (no matches) quirk into a plain object. */
  private asRecordMap(
    v: Record<string, HathiTrustBriefRecord> | never[] | undefined,
  ): Record<string, HathiTrustBriefRecord> {
    return v && !Array.isArray(v) ? v : {};
  }

  private asItemsArray(v: HathiTrustItem[] | never[] | undefined): HathiTrustItem[] {
    return Array.isArray(v) ? v : [];
  }

  private summarizeRecords(
    records: Record<string, HathiTrustBriefRecord>,
  ): HathiTrustRecordSummary[] {
    return Object.entries(records).map(([recordId, r]) => ({
      record_id: recordId,
      record_url: r.recordURL ?? null,
      title: r.titles?.[0] ?? null,
      isbns: [...new Set(r.isbns ?? [])],
      issns: [...new Set(r.issns ?? [])],
      oclcs: [...new Set(r.oclcs ?? [])],
      lccns: [...new Set(r.lccns ?? [])],
      publish_dates: r.publishDates ?? [],
    }));
  }

  private summarizeItems(items: HathiTrustItem[]): HathiTrustItemSummary[] {
    return items.map((it) => ({
      htid: it.htid ?? null,
      contributing_library: it.orig ?? null,
      item_url: it.itemURL ?? null,
      rights_code: it.rightsCode ?? null,
      us_rights: it.usRightsString ?? null,
      last_update: it.lastUpdate ?? null,
    }));
  }

  private buildLookupOutput(
    query: string,
    result: HathiTrustQueryResult | undefined,
  ): HathiTrustLookupOutput {
    const records = this.asRecordMap(result?.records);
    const items = this.asItemsArray(result?.items);
    return {
      query,
      found: Object.keys(records).length > 0,
      records: this.summarizeRecords(records),
      items: this.summarizeItems(items),
    };
  }

  private parseSingle(body: HathiTrustVolumesResponse): HathiTrustLookupOutput {
    const [query, result] = Object.entries(body)[0] ?? ['', undefined];
    return this.buildLookupOutput(query, result);
  }

  private parseBatch(body: HathiTrustVolumesResponse): HathiTrustBatchLookupOutput {
    return {
      results: Object.entries(body).map(([query, result]) => this.buildLookupOutput(query, result)),
    };
  }

  private parseFullRecord(body: HathiTrustVolumesResponse): HathiTrustFullRecordOutput {
    const [query, result] = Object.entries(body)[0] ?? ['', undefined];
    const base = this.buildLookupOutput(query, result);
    const records = this.asRecordMap(result?.records);
    const firstMarc = Object.values(records)[0]?.['marc-xml'];
    return { ...base, marc: firstMarc ? this.parseMarcXml(firstMarc) : null };
  }

  /**
   * Lightweight MARC-XML extraction (no XML dependency in this codebase —
   * see Step 1 read of package.json). MARC-XML is a flat, predictable
   * <datafield tag="NNN"><subfield code="x">...</subfield></datafield>
   * structure, so a scoped regex per datafield is reliable here; a full DOM
   * parser would be overkill for the ~6 fields agents actually want.
   */
  private parseMarcXml(marcXml: string): HathiTrustMarcFields {
    const datafields = this.extractDatafields(marcXml);

    const authors = [
      ...datafields.filter((d) => d.tag === '100').map((d) => d.subfields.a),
      ...datafields.filter((d) => d.tag === '700').map((d) => d.subfields.a),
    ].filter((v): v is string => Boolean(v));

    const pub = datafields.find((d) => d.tag === '260' || d.tag === '264');
    const publisher = pub?.subfields.b ?? null;
    const publishPlace = pub?.subfields.a ?? null;

    const physical = datafields.find((d) => d.tag === '300');
    const physicalDescription = physical
      ? [physical.subfields.a, physical.subfields.b, physical.subfields.c].filter(Boolean).join(' ')
      : null;

    const subjects = datafields
      .filter((d) => ['600', '610', '611', '650', '651'].includes(d.tag))
      .map((d) =>
        [d.subfields.a, d.subfields.x, d.subfields.y, d.subfields.z].filter(Boolean).join(' -- '),
      )
      .filter((s) => s.length > 0);

    // Fixed-length 008 control field: language code is a 3-char code at
    // positions 35-37 (0-indexed), same for every MARC21 record type.
    const controlField008 = marcXml.match(/<controlfield tag="008">([^<]*)<\/controlfield>/);
    const raw008 = controlField008?.[1] ?? '';
    const language = raw008.length >= 38 ? raw008.slice(35, 38).trim() || null : null;

    return {
      authors: [...new Set(authors)],
      publisher: publisher || null,
      publish_place: publishPlace ? publishPlace.replace(/[,:;]\s*$/, '') : null,
      physical_description: physicalDescription || null,
      subjects: [...new Set(subjects)].slice(0, 20),
      language,
    };
  }

  private extractDatafields(marcXml: string): { tag: string; subfields: Record<string, string> }[] {
    const results: { tag: string; subfields: Record<string, string> }[] = [];
    const datafieldRe = /<datafield tag="([^"]*)"[^>]*>([\s\S]*?)<\/datafield>/g;
    const subfieldRe = /<subfield code="([^"]*)">([^<]*)<\/subfield>/g;
    let dfMatch: RegExpExecArray | null;
    while ((dfMatch = datafieldRe.exec(marcXml)) !== null) {
      const tag = dfMatch[1];
      const inner = dfMatch[2];
      const subfields: Record<string, string> = {};
      let sfMatch: RegExpExecArray | null;
      subfieldRe.lastIndex = 0;
      while ((sfMatch = subfieldRe.exec(inner)) !== null) {
        const [, code, value] = sfMatch;
        // First occurrence of a repeated subfield code wins (e.g. multiple
        // $b in 974 holdings fields) — good enough for the fields we read.
        if (!(code in subfields)) {
          subfields[code] = this.decodeXmlEntities(value)
            .replace(/[,/:;]\s*$/, '')
            .trim();
        }
      }
      results.push({ tag, subfields });
    }
    return results;
  }

  private decodeXmlEntities(s: string): string {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    };
  }
}
