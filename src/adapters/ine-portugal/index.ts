import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  IneDataResponse,
  IneMetaResponse,
  IneErrorEnvelope,
  IneDataEnvelope,
  IneMetaEnvelope,
  IneDataRow,
} from './types';

const INE_BASE = 'https://www.ine.pt/ine/json_indicador';

/**
 * Statistics Portugal (INE) JSON Indicator public REST API adapter (UC-658).
 *
 * Flat, non-SDMX API keyed by a 7-digit zero-padded indicator code (`varcd`). No auth, no
 * catalog/search endpoint exists upstream (`pindicaList.jsp` 404s, `xml_indic.jsp?opc=1` throws
 * a server-side NullPointerException) — agents must already know or be told a `varcd`.
 *   ine-portugal.indicator_data     -> GET /pindica.jsp?op=2&varcd=&Dim1=..&Dim2=..&lang=
 *   ine-portugal.indicator_metadata -> GET /pindicaMeta.jsp?op=2&varcd=&lang=
 *
 * CRITICAL: upstream returns HTTP 200 for invalid varcd/DimN codes, with the error only
 * distinguishable by the response body shape `[{"Sucesso":{"Falso":[{...,"Msg":"...","Cod":"N"}]}}]`.
 * parseResponse() below detects this and throws INPUT_REJECTED (422) so BaseAdapter's normal
 * 2xx/4xx status-code branching (which never sees this, since status IS 200) doesn't let it
 * through as a false-success.
 */
export class InePortugalAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'ine-portugal', baseUrl: INE_BASE, maxResponseBytes: 1_000_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const lang = (String(params.lang || 'EN').trim() || 'EN').toUpperCase();

    switch (req.toolId) {
      case 'ine-portugal.indicator_data': {
        const varcd = normalizeVarcd(String(params.varcd || '').trim(), req.toolId, this.provider);
        const qs = new URLSearchParams();
        qs.set('op', '2');
        qs.set('varcd', varcd);
        qs.set('lang', lang);
        for (const dim of ['Dim1', 'Dim2', 'Dim3', 'Dim4', 'Dim5', 'Dim6'] as const) {
          const key = dim.toLowerCase();
          const value = params[key];
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            qs.set(dim, String(value).trim());
          }
        }
        return {
          url: `${INE_BASE}/pindica.jsp?${qs.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case 'ine-portugal.indicator_metadata': {
        const varcd = normalizeVarcd(String(params.varcd || '').trim(), req.toolId, this.provider);
        const qs = new URLSearchParams();
        qs.set('op', '2');
        qs.set('varcd', varcd);
        qs.set('lang', lang);
        return {
          url: `${INE_BASE}/pindicaMeta.jsp?${qs.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
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
    switch (req.toolId) {
      case 'ine-portugal.indicator_data': {
        const body = raw.body as IneDataResponse;
        const errorMsg = extractErrorMessage(body);
        if (errorMsg) {
          this.invalidInput(req.toolId, errorMsg);
        }
        const envelope = (body as [IneDataEnvelope])[0];
        const periods = Object.keys(envelope.Dados ?? {});
        const rows: Array<{ period: string } & IneDataRow> = [];
        for (const period of periods) {
          for (const row of envelope.Dados[period] ?? []) {
            rows.push({ period, ...row });
          }
        }
        return {
          indicator_code: envelope.IndicadorCod,
          indicator_name: envelope.IndicadorDsg,
          last_updated: envelope.DataUltimoAtualizacao ?? null,
          latest_period: envelope.UltimoPref ?? null,
          periods_returned: periods,
          row_count: rows.length,
          data: rows,
        };
      }

      case 'ine-portugal.indicator_metadata': {
        const body = raw.body as IneMetaResponse;
        const errorMsg = extractErrorMessage(body);
        if (errorMsg) {
          this.invalidInput(req.toolId, errorMsg);
        }
        const envelope = (body as [IneMetaEnvelope])[0];
        const dims = envelope.Dimensoes?.Descricao_Dim ?? [];
        const categoryGroups = envelope.Dimensoes?.Categoria_Dim ?? [];

        // Categoria_Dim is an array of single-key objects keyed "Dim_Num{n}_{code}" -> [category].
        // Flatten and group by dim_num so each dimension lists its valid codes.
        const categoriesByDim = new Map<string, Array<{ code: string; label: string }>>();
        for (const group of categoryGroups) {
          for (const entries of Object.values(group)) {
            for (const cat of entries) {
              const list = categoriesByDim.get(cat.dim_num) ?? [];
              list.push({ code: cat.categ_cod, label: cat.categ_dsg });
              categoriesByDim.set(cat.dim_num, list);
            }
          }
        }

        return {
          indicator_code: envelope.IndicadorCod,
          indicator_name: envelope.IndicadorNome,
          periodicity: envelope.Periodic ?? null,
          first_period: envelope.PrimeiroPeriodo ?? null,
          last_period: envelope.UltimoPeriodo ?? null,
          unit: envelope.UnidadeMedida ?? null,
          decimal_precision: envelope.PrecisaoDecimal ?? null,
          last_updated: envelope.DataUltimaAtualizacao ?? null,
          dimensions: dims.map((d) => ({
            dim_num: d.dim_num,
            label: d.abrv,
            note: d.nota_dsg ?? null,
            // Cap codes per dimension to keep metadata responses well under the 1MB limit —
            // some dimensions (e.g. municipality/NUTS geography) carry 300+ codes.
            codes: (categoriesByDim.get(d.dim_num) ?? []).slice(0, 300),
          })),
        };
      }

      default:
        return raw.body;
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
    };
  }
}

/** varcd must be exactly 7 digits (zero-padded, e.g. "0008273"). */
function normalizeVarcd(value: string, toolId: string, provider: string): string {
  if (!/^\d{1,7}$/.test(value)) {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message: 'varcd must be a numeric indicator code (up to 7 digits, e.g. "0008273").',
      provider,
      toolId,
      durationMs: 0,
    };
  }
  return value.padStart(7, '0');
}

/** Detects the `[{"Sucesso":{"Falso":[...]}}]` error envelope that upstream returns with HTTP 200. */
function extractErrorMessage(body: unknown): string | null {
  if (!Array.isArray(body) || body.length === 0) return null;
  const first = body[0] as IneErrorEnvelope | undefined;
  const falso = first?.Sucesso?.Falso;
  if (Array.isArray(falso) && falso.length > 0) {
    return falso.map((f) => f.Msg).join('; ');
  }
  return null;
}
