import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { OrcidExpandedSearchResponse, OrcidPersonResponse, OrcidWorksResponse } from './types';

function trim(v: string | null | undefined): string | null {
  return v == null ? null : v.trim() || null;
}

function fullName(n: {
  'given-names'?: string | null;
  'family-names'?: string | null;
  'credit-name'?: string | null;
}): string | null {
  if (n['credit-name']) return trim(n['credit-name']);
  return [trim(n['given-names']), trim(n['family-names'])].filter(Boolean).join(' ') || null;
}

function publicationDate(
  pd: {
    year: { value: string } | null;
    month: { value: string } | null;
    day: { value: string } | null;
  } | null,
): string | null {
  if (!pd?.year?.value) return null;
  const y = pd.year.value;
  const m = pd.month?.value ? pd.month.value.padStart(2, '0') : null;
  const d = pd.day?.value ? pd.day.value.padStart(2, '0') : null;
  return [y, m, d].filter(Boolean).join('-');
}

/**
 * ORCID Public API v3.0 adapter (UC-740).
 * https://pub.orcid.org/v3.0 — global registry of unique researcher
 * identifiers (ORCID iDs), linking a researcher to their publications,
 * affiliations, and other identifiers. No auth, no key, fully public data
 * (ORCID Public API, unauthenticated `pub.orcid.org` endpoints).
 */
export class OrcidAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'orcid',
      baseUrl: 'https://pub.orcid.org/v3.0',
      maxResponseBytes: 3_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = (req.params ?? {}) as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'orcid.search_researcher': {
        const rows = Math.min(Math.max(Number(p.rows ?? 10) || 10, 1), 50);
        const start = Math.max(Number(p.start ?? 0) || 0, 0);
        const qs = new URLSearchParams({
          q: String(p.query ?? ''),
          rows: String(rows),
          start: String(start),
        });
        return {
          url: `${this.baseUrl}/expanded-search?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'orcid.get_person': {
        const orcidId = String(p.orcid_id ?? '');
        return {
          url: `${this.baseUrl}/${encodeURIComponent(orcidId)}/person`,
          method: 'GET',
          headers,
        };
      }
      case 'orcid.get_works': {
        const orcidId = String(p.orcid_id ?? '');
        return {
          url: `${this.baseUrl}/${encodeURIComponent(orcidId)}/works`,
          method: 'GET',
          headers,
        };
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
      case 'orcid.search_researcher': {
        const body = raw.body as OrcidExpandedSearchResponse;
        const results = (body?.['expanded-result'] ?? []).filter((r): r is NonNullable<typeof r> =>
          Boolean(r),
        );
        return {
          count: body?.['num-found'] ?? results.length,
          results: results.map((r) => ({
            orcid_id: r['orcid-id'],
            name: fullName(r),
            other_names: (r['other-name'] ?? []).filter(Boolean),
            institutions: (r['institution-name'] ?? []).filter(Boolean),
          })),
        };
      }
      case 'orcid.get_person': {
        const body = raw.body as OrcidPersonResponse;
        if (!body || !body.path) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'No ORCID record found for the given ORCID iD',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        const otherNames = (body['other-names']?.['other-name'] ?? []).filter(
          (n): n is NonNullable<typeof n> => Boolean(n),
        );
        const keywords = (body.keywords?.keyword ?? []).filter((k): k is NonNullable<typeof k> =>
          Boolean(k),
        );
        const urls = (body['researcher-urls']?.['researcher-url'] ?? []).filter(
          (u): u is NonNullable<typeof u> => Boolean(u),
        );
        const externalIds = (body['external-identifiers']?.['external-identifier'] ?? []).filter(
          (e): e is NonNullable<typeof e> => Boolean(e),
        );
        const countries = (body.addresses?.address ?? [])
          .map((a) => a?.country?.value)
          .filter((v): v is string => Boolean(v));
        return {
          // NOTE: body.path on the /person response is "/{orcid}/person" (a URL
          // path, not a bare ID) — echo the validated input param instead.
          orcid_id: String((req.params as Record<string, unknown>)?.orcid_id ?? ''),
          name: body.name
            ? fullName({
                'given-names': body.name['given-names']?.value ?? null,
                'family-names': body.name['family-name']?.value ?? null,
                'credit-name': body.name['credit-name']?.value ?? null,
              })
            : null,
          other_names: otherNames.map((n) => trim(n.content)).filter(Boolean),
          biography: trim(body.biography?.content ?? null),
          keywords: keywords.map((k) => trim(k.content)).filter(Boolean),
          country: countries[0] ?? null,
          researcher_urls: urls.map((u) => ({
            name: trim(u['url-name']),
            url: trim(u.url?.value ?? null),
          })),
          external_identifiers: externalIds.map((e) => ({
            type: e['external-id-type'],
            value: e['external-id-value'],
            url: trim(e['external-id-url']?.value ?? null),
          })),
        };
      }
      case 'orcid.get_works': {
        const body = raw.body as OrcidWorksResponse;
        const groups = (body?.group ?? []).filter((g): g is NonNullable<typeof g> => Boolean(g));
        const works = groups
          .map((g) => g['work-summary']?.[0])
          .filter((w): w is NonNullable<typeof w> => Boolean(w));
        return {
          count: works.length,
          results: works.map((w) => {
            const ids = (w['external-ids']?.['external-id'] ?? []).filter(
              (e): e is NonNullable<typeof e> => Boolean(e),
            );
            const doi = ids.find((e) => e['external-id-type'] === 'doi')?.['external-id-value'];
            return {
              put_code: w['put-code'],
              title: trim(w.title?.title?.value ?? null),
              type: trim(w.type),
              journal_title: trim(w['journal-title']?.value ?? null),
              publication_date: publicationDate(w['publication-date']),
              doi: doi ?? null,
              external_ids: ids.map((e) => ({
                type: e['external-id-type'],
                value: e['external-id-value'],
              })),
            };
          }),
        };
      }
      default:
        return raw.body;
    }
  }
}
