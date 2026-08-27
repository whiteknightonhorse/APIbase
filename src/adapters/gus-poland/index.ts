import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  type ProviderError,
  ProviderErrorCode,
} from '../../types/provider';
import type { BdlPagedSubjects, BdlPagedVariables, BdlDataResponse, BdlErrorResult } from './types';

const GUS_POLAND_BASE = 'https://bdl.stat.gov.pl/api/v1';

/**
 * GUS Poland BDL (Bank Danych Lokalnych / Local Data Bank) adapter (UC-617).
 *
 * Poland's official statistics office (Główny Urząd Statystyczny) publishes ~40,000
 * territorial-unit statistical variables (population, prices, economy, environment,
 * etc.) as a public, no-auth REST API — no registration/X-ClientId required for the
 * anonymous quota. Docs: https://api.stat.gov.pl/Home/BdlApi
 *   gus-poland.subjects  -> GET /subjects[?parent-id=]      (topic tree)
 *   gus-poland.variables -> GET /variables/search?name=  or  /variables?subject-id=
 *   gus-poland.data      -> GET /data/by-variable/{id}  or  /data/by-unit/{id}
 *
 * QUIRK: the anonymous /units and /units/search endpoints have a very tight shared
 * quota ("100 per 15 min" / "1000 per 12h") that was already exhausted from this
 * server's IP during live verification — so this adapter deliberately avoids them.
 * Territorial units are instead addressed by `unit_level` (0-7, e.g. 2=voivodeship)
 * on /data/by-variable, which was NOT rate-limited in testing, or by a caller-supplied
 * `unit_id` (BDL 12-digit TERYT-based code) on /data/by-unit.
 *
 * QUIRK: GUS BDL signals quota-exceeded as HTTP 200 with body `{"errorResult": "..."}`,
 * not an HTTP error status — base.adapter.ts's status-code classification can't see
 * this, so parseResponse() detects it and throws RATE_LIMIT itself.
 */
export class GusPolandAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'gus-poland', baseUrl: GUS_POLAND_BASE, maxResponseBytes: 1_500_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'gus-poland.subjects': {
        const qs = new URLSearchParams({ lang: 'en', format: 'json' });
        const parentId = params.parent_id !== undefined ? String(params.parent_id).trim() : '';
        if (parentId) qs.set('parent-id', parentId);
        this.applyPaging(qs, params);
        return { url: `${GUS_POLAND_BASE}/subjects?${qs}`, method: 'GET', headers };
      }

      case 'gus-poland.variables': {
        const query = params.query !== undefined ? String(params.query).trim() : '';
        const subjectId = params.subject_id !== undefined ? String(params.subject_id).trim() : '';
        if (!query && !subjectId) {
          throw this.invalidInput(req.toolId, 'Either query or subject_id is required');
        }
        const qs = new URLSearchParams({ lang: 'en', format: 'json' });
        this.applyPaging(qs, params);
        if (query) {
          qs.set('name', query);
          return { url: `${GUS_POLAND_BASE}/variables/search?${qs}`, method: 'GET', headers };
        }
        qs.set('subject-id', subjectId);
        return { url: `${GUS_POLAND_BASE}/variables?${qs}`, method: 'GET', headers };
      }

      case 'gus-poland.data': {
        const unitId = params.unit_id !== undefined ? String(params.unit_id).trim() : '';
        const qs = new URLSearchParams({ lang: 'en', format: 'json' });
        this.applyPaging(qs, params);
        const years = Array.isArray(params.year) ? params.year : [];
        for (const y of years) qs.append('year', String(y));

        if (unitId) {
          const variableId =
            params.variable_id !== undefined ? String(params.variable_id).trim() : '';
          if (!variableId) {
            throw this.invalidInput(req.toolId, 'variable_id is required when unit_id is set');
          }
          qs.set('var-id', variableId);
          return {
            url: `${GUS_POLAND_BASE}/data/by-unit/${encodeURIComponent(unitId)}?${qs}`,
            method: 'GET',
            headers,
          };
        }

        const variableId =
          params.variable_id !== undefined ? String(params.variable_id).trim() : '';
        if (!variableId) {
          throw this.invalidInput(req.toolId, 'variable_id is required');
        }
        const unitLevel = params.unit_level !== undefined ? Number(params.unit_level) : 2;
        qs.set('unit-level', String(unitLevel));
        return {
          url: `${GUS_POLAND_BASE}/data/by-variable/${encodeURIComponent(variableId)}?${qs}`,
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
        } satisfies ProviderError;
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    this.assertNoErrorResult(raw, req.toolId);

    switch (req.toolId) {
      case 'gus-poland.subjects': {
        const body = raw.body as BdlPagedSubjects;
        return {
          total: body.totalRecords,
          page: body.page,
          page_size: body.pageSize,
          has_more: Boolean(body.links?.next),
          subjects: (body.results ?? []).map((s) => ({
            subject_id: s.id,
            parent_id: s.parentId ?? null,
            name: s.name,
            has_variables: s.hasVariables,
            children: s.children ?? [],
          })),
        };
      }

      case 'gus-poland.variables': {
        const body = raw.body as BdlPagedVariables;
        return {
          total: body.totalRecords,
          page: body.page,
          page_size: body.pageSize,
          has_more: Boolean(body.links?.next),
          variables: (body.results ?? []).map((v) => ({
            variable_id: v.id,
            subject_id: v.subjectId,
            name: [v.n1, v.n2, v.n3].filter(Boolean).join(' — '),
            level: v.level,
            measure_unit: v.measureUnitName,
          })),
        };
      }

      case 'gus-poland.data': {
        const body = raw.body as BdlDataResponse;
        return {
          total: body.totalRecords,
          has_more: Boolean(body.links?.next),
          variable_id: body.variableId ?? null,
          measure_unit_id: body.measureUnitId ?? null,
          last_update: body.lastUpdate,
          units: (body.results ?? []).map((u) => ({
            unit_id: u.id,
            unit_name: u.name,
            values: (u.values ?? []).map((v) => ({ year: v.year, value: v.val })),
          })),
        };
      }

      default:
        return raw.body;
    }
  }

  private applyPaging(qs: URLSearchParams, params: Record<string, unknown>): void {
    if (params.page !== undefined) {
      qs.set('page', String(Math.max(0, Number(params.page) || 0)));
    }
    const pageSize = params.page_size !== undefined ? Number(params.page_size) : 20;
    qs.set('page-size', String(Math.min(100, Math.max(1, pageSize || 20))));
  }

  /** GUS BDL signals quota exhaustion as HTTP 200 with `{"errorResult": "..."}`. */
  private assertNoErrorResult(raw: ProviderRawResponse, toolId: string): void {
    const body = raw.body as Partial<BdlErrorResult> | undefined;
    if (body && typeof body === 'object' && typeof body.errorResult === 'string') {
      throw {
        code: ProviderErrorCode.RATE_LIMIT,
        httpStatus: 429,
        message: `GUS BDL API: ${body.errorResult}`,
        provider: this.provider,
        toolId,
        durationMs: raw.durationMs,
        retryAfter: 900,
      } satisfies ProviderError;
    }
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    } satisfies ProviderError;
  }
}
