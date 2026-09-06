import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { FbiWantedItem, FbiWantedListResponse } from './types';

const MAX_PAGE_SIZE = 50;

function clampPageSize(v: unknown, fallback = 20): number {
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Number(v ?? fallback)));
}

function toSummary(item: FbiWantedItem) {
  return {
    uid: item.uid,
    title: item.title,
    description: item.description,
    status: item.status,
    poster_classification: item.poster_classification,
    person_classification: item.person_classification,
    subjects: item.subjects,
    field_offices: item.field_offices,
    publication: item.publication,
    modified: item.modified,
    sex: item.sex,
    race: item.race,
    aliases: item.aliases,
    reward_text: item.reward_text,
    warning_message: item.warning_message,
    caution: item.caution,
    url: item.url,
    images: (item.images ?? []).map((i) => ({ thumb: i.thumb, large: i.large })),
  };
}

/**
 * FBI Wanted API adapter (UC-738).
 * https://api.fbi.gov/wanted/v1 — FBI's public "Wanted" poster feed (Ten Most
 * Wanted, fraudsters, kidnappings, missing persons, law-enforcement
 * assistance requests, etc). No auth, no key, public US Government data
 * (17 U.S.C. § 105 — not subject to copyright).
 */
export class FbiWantedAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'fbiwanted',
      baseUrl: 'https://api.fbi.gov/wanted/v1',
      maxResponseBytes: 3_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = (req.params ?? {}) as Record<string, unknown>;
    // api.fbi.gov's WAF returns a 403 "security issue" block page for
    // requests with no User-Agent header — Node's fetch() sends none by
    // default (unlike curl), so this must be set explicitly.
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (+https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'fbiwanted.search': {
        const qs = new URLSearchParams();
        if (p.title) qs.set('title', String(p.title));
        if (p.field_office) qs.set('field_offices', String(p.field_office));
        if (p.sex) qs.set('sex', String(p.sex));
        if (p.race) qs.set('race', String(p.race));
        if (p.person_classification) {
          qs.set('person_classification', String(p.person_classification));
        }
        qs.set('page', String(Math.max(1, Number(p.page ?? 1))));
        qs.set('pageSize', String(clampPageSize(p.page_size)));
        return { url: `${this.baseUrl}/list?${qs.toString()}`, method: 'GET', headers };
      }
      case 'fbiwanted.by_category': {
        const qs = new URLSearchParams();
        qs.set('poster_classification', String(p.category ?? ''));
        qs.set('page', String(Math.max(1, Number(p.page ?? 1))));
        qs.set('pageSize', String(clampPageSize(p.page_size)));
        return { url: `${this.baseUrl}/list?${qs.toString()}`, method: 'GET', headers };
      }
      case 'fbiwanted.recent': {
        const qs = new URLSearchParams();
        if (p.field_office) qs.set('field_offices', String(p.field_office));
        qs.set('sort_on', 'publication');
        qs.set('sort_order', 'desc');
        qs.set('page', '1');
        qs.set('pageSize', String(clampPageSize(p.page_size)));
        return { url: `${this.baseUrl}/list?${qs.toString()}`, method: 'GET', headers };
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'fbiwanted.search':
      case 'fbiwanted.by_category':
      case 'fbiwanted.recent': {
        const body = raw.body as FbiWantedListResponse;
        const items = body?.items ?? [];
        return {
          total: body?.total ?? items.length,
          page: body?.page ?? 1,
          results: items.map(toSummary),
        };
      }
      default:
        return raw.body;
    }
  }
}
