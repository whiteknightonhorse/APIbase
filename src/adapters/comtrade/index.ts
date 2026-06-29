import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  ComtradeTradeResponse,
  ComtradeAvailabilityResponse,
  ComtradeMetadataResponse,
  ComtradeReportersFile,
} from './types';

/**
 * UN Comtrade Public Preview API adapter (UC-534).
 *
 * Supported tools:
 *   comtrade.trade_data    → GET /public/v1/preview/{typeCode}/{freqCode}/{clCode}
 *   comtrade.availability  → GET /public/v1/getDA/{typeCode}/{freqCode}/{clCode}
 *   comtrade.metadata      → GET /public/v1/getMetadata/{typeCode}/{freqCode}/{clCode}
 *   comtrade.reporters     → GET /files/v1/app/reference/Reporters.json
 *
 * Auth: None (public endpoints).
 * Free tier: 500 calls/day (shared across preview + getDA + getMetadata).
 * Data coverage: 200+ reporter countries, 1962–present (annual), 2010–present (monthly).
 */
export class ComtradeAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'comtrade',
      baseUrl: 'https://comtradeapi.un.org',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase.pro/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'comtrade.trade_data':
        return this.buildTradeDataRequest(params, headers);
      case 'comtrade.availability':
        return this.buildAvailabilityRequest(params, headers);
      case 'comtrade.metadata':
        return this.buildMetadataRequest(params, headers);
      case 'comtrade.reporters':
        return this.buildReportersRequest(headers);
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
    const body = raw.body;

    switch (req.toolId) {
      case 'comtrade.trade_data': {
        const data = body as ComtradeTradeResponse;
        return {
          count: data.count,
          elapsed_time: data.elapsedTime,
          records: data.data.map((r) => ({
            period: r.period,
            reporter: r.reporterDesc,
            reporter_code: r.reporterCode,
            reporter_iso3: r.reporterISO,
            partner: r.partnerDesc,
            partner_code: r.partnerCode,
            partner_iso3: r.partnerISO,
            flow: r.flowDesc,
            flow_code: r.flowCode,
            commodity_code: r.cmdCode,
            commodity_desc: r.cmdDesc,
            classification: r.classificationSearchCode,
            primary_value_usd: r.primaryValue,
            fob_value_usd: r.fobvalue,
            cif_value_usd: r.cifvalue,
            qty: r.qty,
            qty_unit: r.qtyUnitAbbr,
            net_weight_kg: r.netWgt,
            customs_code: r.customsCode,
            mode_of_transport: r.motDesc,
            aggregation_level: r.aggrLevel,
          })),
          error: data.error || null,
        };
      }

      case 'comtrade.availability': {
        const data = body as ComtradeAvailabilityResponse;
        return {
          count: data.count,
          elapsed_time: data.elapsedTime,
          datasets: data.data.map((d) => ({
            dataset_code: d.datasetCode,
            reporter: d.reporterDesc,
            reporter_code: d.reporterCode,
            reporter_iso3: d.reporterISO,
            period: d.period,
            classification: d.classificationCode,
            total_records: d.totalRecords,
            first_released: d.firstReleased,
            last_released: d.lastReleased,
          })),
          error: data.error || null,
        };
      }

      case 'comtrade.metadata': {
        const data = body as ComtradeMetadataResponse;
        return {
          count: data.count,
          elapsed_time: data.elapsedTime,
          datasets: data.data.map((d) => ({
            reporter_code: d.reporterCode,
            period: d.period,
            dataset_code: d.datasetCode,
            notes: d.notes.map((n) => ({
              reporter: n.reporterDescription,
              currency: n.currency,
              import_conv_factor: n.importConvFactor,
              export_conv_factor: n.exportConvFactor,
              trade_system: n.tradeSystem,
              classification: n.classificationCode,
              import_valuation: n.importValuation,
              export_valuation: n.exportValuation,
              import_partner_country: n.importPartnerCountry,
              export_partner_country: n.exportPartnerCountry,
              publication_note: n.publicationNote,
              publication_date: n.publicationDate,
            })),
          })),
          error: data.error || null,
        };
      }

      case 'comtrade.reporters': {
        const data = body as ComtradeReportersFile;
        const params = req.params as Record<string, unknown>;
        let reporters = data.results;

        if (params.include_groups === false || params.include_groups === 'false') {
          reporters = reporters.filter((r) => !r.isGroup);
        }

        if (params.search) {
          const q = String(params.search).toLowerCase();
          reporters = reporters.filter(
            (r) =>
              r.reporterDesc.toLowerCase().includes(q) ||
              r.reporterCodeIsoAlpha3.toLowerCase().includes(q) ||
              r.reporterCodeIsoAlpha2.toLowerCase().includes(q),
          );
        }

        return {
          count: reporters.length,
          reporters: reporters.map((r) => ({
            code: r.reporterCode,
            name: r.reporterDesc,
            iso2: r.reporterCodeIsoAlpha2,
            iso3: r.reporterCodeIsoAlpha3,
            is_group: r.isGroup,
          })),
        };
      }

      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildTradeDataRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const typeCode = params.type_code ? String(params.type_code) : 'C';
    const freqCode = params.freq_code ? String(params.freq_code) : 'A';
    const clCode = params.classification ? String(params.classification) : 'HS';

    const qs = new URLSearchParams();
    if (params.reporter_code) qs.set('reporterCode', String(params.reporter_code));
    if (params.period) qs.set('period', String(params.period));
    if (params.cmd_code) qs.set('cmdCode', String(params.cmd_code));
    if (params.flow_code) qs.set('flowCode', String(params.flow_code));
    if (params.partner_code !== undefined) qs.set('partnerCode', String(params.partner_code));
    if (params.partner2_code !== undefined) qs.set('partner2Code', String(params.partner2_code));
    if (params.customs_code) qs.set('customsCode', String(params.customs_code));
    if (params.mot_code !== undefined) qs.set('motCode', String(params.mot_code));
    if (params.aggregate_by) qs.set('aggregateBy', String(params.aggregate_by));
    qs.set('maxRecords', params.max_records ? String(params.max_records) : '100');
    qs.set('format', 'JSON');
    qs.set('includeDesc', 'true');

    return {
      url: `${this.baseUrl}/public/v1/preview/${encodeURIComponent(typeCode)}/${encodeURIComponent(freqCode)}/${encodeURIComponent(clCode)}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildAvailabilityRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const typeCode = params.type_code ? String(params.type_code) : 'C';
    const freqCode = params.freq_code ? String(params.freq_code) : 'A';
    const clCode = params.classification ? String(params.classification) : 'HS';

    const qs = new URLSearchParams();
    if (params.reporter_code) qs.set('reporterCode', String(params.reporter_code));
    if (params.period) qs.set('period', String(params.period));
    if (params.cmd_code) qs.set('cmdCode', String(params.cmd_code));
    if (params.flow_code) qs.set('flowCode', String(params.flow_code));
    qs.set('maxRecords', '50');
    qs.set('format', 'JSON');

    return {
      url: `${this.baseUrl}/public/v1/getDA/${encodeURIComponent(typeCode)}/${encodeURIComponent(freqCode)}/${encodeURIComponent(clCode)}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildMetadataRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const typeCode = params.type_code ? String(params.type_code) : 'C';
    const freqCode = params.freq_code ? String(params.freq_code) : 'A';
    const clCode = params.classification ? String(params.classification) : 'HS';

    const qs = new URLSearchParams();
    if (params.reporter_code) qs.set('reporterCode', String(params.reporter_code));
    if (params.period) qs.set('period', String(params.period));
    if (params.show_history !== undefined) qs.set('showHistory', String(params.show_history));
    qs.set('format', 'JSON');

    return {
      url: `${this.baseUrl}/public/v1/getMetadata/${encodeURIComponent(typeCode)}/${encodeURIComponent(freqCode)}/${encodeURIComponent(clCode)}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildReportersRequest(headers: Record<string, string>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    return {
      url: `${this.baseUrl}/files/v1/app/reference/Reporters.json`,
      method: 'GET',
      headers,
    };
  }
}
