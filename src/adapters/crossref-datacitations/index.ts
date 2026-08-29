import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { DataCitationsResponse, DataCitationsOutput } from './types';

const DATACITATIONS_BASE = 'https://api.crossref.org/beta/datacitations/';
const CONTACT_MAILTO = 'infocitysms@gmail.com';
const DOI_RE = /^10\.\d{4,9}\/\S+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/;

/**
 * CrossRef Data Citations API adapter (UC-634).
 *
 * Supported tools:
 *   crossref-datacitations.dataset_citations -> ?object-id=...   scholarly works that cite a dataset DOI
 *   crossref-datacitations.article_datasets  -> ?subject-id=...  datasets cited by a scholarly work DOI
 *   crossref-datacitations.recent_citations  -> ?from/until-created-date, member-id  browse citation events
 *
 * Auth: None. Public beta service that replaced the sunset (2026-04-23) Event Data API — a
 * `mailto` query param is sent for the "polite pool" per CrossRef's request, not a credential.
 * Data is CC0, sourced from references/relations deposited by CrossRef members
 * (Crossref-DOI or DataCite-DOI datasets). 5-day delay between metadata deposit and API appearance.
 */
export class CrossrefDataCitationsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'crossref-datacitations', baseUrl: DATACITATIONS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': `APIbase/1.0 (https://apibase.pro; mailto:${CONTACT_MAILTO})`,
    };
    const qs = new URLSearchParams();
    qs.set('mailto', CONTACT_MAILTO);

    switch (req.toolId) {
      case 'crossref-datacitations.dataset_citations': {
        const objectDoi = String(params.dataset_doi || '').trim();
        if (!DOI_RE.test(objectDoi)) {
          throw this.invalidInput(
            req.toolId,
            'dataset_doi must be a valid DOI (e.g. 10.5061/dryad.abc123)',
          );
        }
        qs.set('object-id', objectDoi);
        qs.set('rows', String(this.clampRows(params.rows)));
        break;
      }

      case 'crossref-datacitations.article_datasets': {
        const subjectDoi = String(params.article_doi || '').trim();
        if (!DOI_RE.test(subjectDoi)) {
          throw this.invalidInput(
            req.toolId,
            'article_doi must be a valid DOI (e.g. 10.1016/j.example.2024.01.001)',
          );
        }
        qs.set('subject-id', subjectDoi);
        qs.set('rows', String(this.clampRows(params.rows)));
        break;
      }

      case 'crossref-datacitations.recent_citations': {
        const fromDate = params.from_date ? String(params.from_date).trim() : undefined;
        const untilDate = params.until_date ? String(params.until_date).trim() : undefined;
        const memberId = params.member_id ? String(params.member_id).trim() : undefined;
        if (fromDate) {
          if (!DATE_RE.test(fromDate)) {
            throw this.invalidInput(
              req.toolId,
              'from_date must be YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS',
            );
          }
          qs.set('from-created-date', fromDate);
        }
        if (untilDate) {
          if (!DATE_RE.test(untilDate)) {
            throw this.invalidInput(
              req.toolId,
              'until_date must be YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS',
            );
          }
          qs.set('until-created-date', untilDate);
        }
        if (memberId) {
          qs.set('member-id', memberId);
        }
        qs.set('rows', String(this.clampRows(params.rows)));
        break;
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

    return { url: `${DATACITATIONS_BASE}?${qs.toString()}`, method: 'GET', headers };
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return this.parseCitations(raw.body as DataCitationsResponse);
  }

  private parseCitations(data: DataCitationsResponse): DataCitationsOutput {
    const msg = data.message;
    return {
      total: msg['total-results'] ?? 0,
      has_more: msg['next-page'] !== null && msg['next-page'] !== undefined,
      results: (msg.items ?? []).map((item) => ({
        relation: item.relation,
        timestamp: item.timestamp,
        citing_work_doi: item.subject.id,
        citing_work_type: item.subject.type,
        citing_work_member_id: item.subject.member ?? null,
        dataset_doi: item.object.id,
        dataset_registration_agency: item.object['registration-agency'] ?? null,
      })),
    };
  }

  private clampRows(value: unknown): number {
    return Math.min(Math.max(Number(value) || 20, 1), 500);
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
