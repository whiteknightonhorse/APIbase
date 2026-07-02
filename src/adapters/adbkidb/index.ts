import { logger } from '../../config/logger';
import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_TIMEOUT_MS,
  PROVIDER_BACKOFF_BASE_MS,
} from '../../types/provider';
import type {
  AdbkidbIndicatorRaw,
  AdbkidbDataOutput,
  AdbkidbIndicatorsOutput,
  AdbkidbDataflowsOutput,
  AdbkidbEconomiesOutput,
} from './types';

const KIDB_BASE = 'https://kidb.adb.org';

// ADB member economies (50 developing and developed member countries)
const ADB_ECONOMIES: Array<{ code: string; name: string }> = [
  { code: 'AFG', name: 'Afghanistan' },
  { code: 'ARM', name: 'Armenia' },
  { code: 'AUS', name: 'Australia' },
  { code: 'AZE', name: 'Azerbaijan' },
  { code: 'BAN', name: 'Bangladesh' },
  { code: 'BHU', name: 'Bhutan' },
  { code: 'BRU', name: 'Brunei Darussalam' },
  { code: 'CAM', name: 'Cambodia' },
  { code: 'PRC', name: "China, People's Republic of" },
  { code: 'COO', name: 'Cook Islands' },
  { code: 'FIJ', name: 'Fiji' },
  { code: 'GEO', name: 'Georgia' },
  { code: 'HKG', name: 'Hong Kong, China' },
  { code: 'IND', name: 'India' },
  { code: 'INO', name: 'Indonesia' },
  { code: 'JPN', name: 'Japan' },
  { code: 'KAZ', name: 'Kazakhstan' },
  { code: 'KIR', name: 'Kiribati' },
  { code: 'KOR', name: 'Korea, Republic of' },
  { code: 'KGZ', name: 'Kyrgyz Republic' },
  { code: 'LAO', name: "Lao People's Democratic Republic" },
  { code: 'MAL', name: 'Malaysia' },
  { code: 'MLD', name: 'Maldives' },
  { code: 'RMI', name: 'Marshall Islands' },
  { code: 'FSM', name: 'Micronesia, Federated States of' },
  { code: 'MON', name: 'Mongolia' },
  { code: 'MYA', name: 'Myanmar' },
  { code: 'NAU', name: 'Nauru' },
  { code: 'NEP', name: 'Nepal' },
  { code: 'NZL', name: 'New Zealand' },
  { code: 'NIU', name: 'Niue' },
  { code: 'PAK', name: 'Pakistan' },
  { code: 'PLW', name: 'Palau' },
  { code: 'PNG', name: 'Papua New Guinea' },
  { code: 'PHI', name: 'Philippines' },
  { code: 'SAM', name: 'Samoa' },
  { code: 'SIN', name: 'Singapore' },
  { code: 'SOL', name: 'Solomon Islands' },
  { code: 'SRI', name: 'Sri Lanka' },
  { code: 'TAP', name: 'Taipei,China' },
  { code: 'TAJ', name: 'Tajikistan' },
  { code: 'THA', name: 'Thailand' },
  { code: 'TIM', name: 'Timor-Leste' },
  { code: 'TON', name: 'Tonga' },
  { code: 'TUR', name: 'Türkiye' },
  { code: 'TKM', name: 'Turkmenistan' },
  { code: 'TUV', name: 'Tuvalu' },
  { code: 'UZB', name: 'Uzbekistan' },
  { code: 'VAN', name: 'Vanuatu' },
  { code: 'VIE', name: 'Viet Nam' },
];

// 62 KIDB dataflows derived from the official KIDB API documentation page
const KIDB_DATAFLOWS: Array<{ code: string; name: string }> = [
  { code: 'PPL', name: 'People' },
  { code: 'PPL_LE', name: 'People, Labor Force and Employment' },
  { code: 'PPL_POV', name: 'People, Poverty Indicators' },
  { code: 'PPL_POP', name: 'People, Population' },
  { code: 'PPL_SI', name: 'People, Social Indicators' },
  { code: 'EO', name: 'Economy and Output' },
  { code: 'EO_NA', name: 'Economy and Output, National Accounts' },
  { code: 'EO_NA_CURR', name: 'Economy and Output, National Accounts, At Current Prices' },
  { code: 'EO_NA_CURR_GVA', name: 'Gross value added by industry at current prices' },
  { code: 'EO_NA_CURR_GDP_EXP', name: 'Gross domestic product by expenditure at current prices' },
  { code: 'EO_NA_CURR_GDP_SOO', name: 'Structure of Output (% of GDP at current market prices)' },
  { code: 'EO_NA_CURR_GDP_SOD', name: 'Structure of Demand (% of GDP at current market prices)' },
  { code: 'EO_NA_CONST', name: 'Economy and Output, National Accounts, At Constant Prices' },
  { code: 'EO_NA_CONST_GVA', name: 'Gross value added by industry at constant prices' },
  { code: 'EO_NA_CONST_GDP_EXP', name: 'Gross domestic product by expenditure at constant prices' },
  { code: 'EO_NA_CONST_GOO', name: 'Growth of Output (% annual change)' },
  { code: 'EO_NA_CONST_GOD', name: 'Growth of Demand (% annual change)' },
  {
    code: 'EO_NA_INV_FIN',
    name: 'Economy and Output, National Accounts, Investment Financing at Current Prices',
  },
  { code: 'EO_PRIX', name: 'Economy and Output, Production Index' },
  { code: 'EGELC', name: 'Energy and Electricity' },
  { code: 'EGELC_EG', name: 'Energy and Electricity, Energy' },
  { code: 'EGELC_ELC', name: 'Energy and Electricity, Electricity' },
  { code: 'MFP', name: 'Money, Finance, and Prices' },
  { code: 'MFP_PR', name: 'Money, Finance, and Prices, Prices' },
  { code: 'MFP_MF', name: 'Money, Finance, and Prices, Money and Finance' },
  { code: 'MFP_XR', name: 'Money, Finance, and Prices, Exchange Rates' },
  { code: 'GG', name: 'Government and Governance' },
  { code: 'GG_GF', name: 'Government and Governance, Government Finance' },
  { code: 'GG_GV', name: 'Government and Governance, Governance' },
  { code: 'GLB', name: 'Globalization' },
  { code: 'GLB_ET', name: 'Globalization, External Trade' },
  { code: 'GLB_BP', name: 'Globalization, Balance of Payments' },
  { code: 'GLB_IR', name: 'Globalization, International Reserves' },
  { code: 'GLB_EI', name: 'Globalization, External Indebtedness' },
  { code: 'GLB_CF', name: 'Globalization, Capital Flows' },
  { code: 'GLB_TM', name: 'Globalization, Tourism' },
  { code: 'TC', name: 'Transport and Communication' },
  { code: 'TC_COM', name: 'Transport and Communication, Communications' },
  { code: 'TC_TR', name: 'Transport and Communication, Transport' },
  { code: 'ENV', name: 'Environment and Climate Change' },
  { code: 'ENV_LD', name: 'Environment and Climate Change, Land' },
  { code: 'ENV_PN', name: 'Environment and Climate Change, Air Pollution' },
  { code: 'ENV_FW', name: 'Environment and Climate Change, Fresh Water' },
  {
    code: 'ENV_CC',
    name: 'Environment and Climate Change, Climate and Climate-related disaster',
  },
  { code: 'SDG', name: 'Sustainable Development Goals (SDGs)' },
  { code: 'SDG_01', name: 'Goal 1 - No Poverty' },
  { code: 'SDG_02', name: 'Goal 2 - Zero Hunger' },
  { code: 'SDG_03', name: 'Goal 3 - Good health and well-being' },
  { code: 'SDG_04', name: 'Goal 4 - Quality Education' },
  { code: 'SDG_05', name: 'Goal 5 - Gender equality' },
  { code: 'SDG_06', name: 'Goal 6 - Clean water and sanitation' },
  { code: 'SDG_07', name: 'Goal 7 - Affordable and clean energy' },
  { code: 'SDG_08', name: 'Goal 8 - Decent work and economic growth' },
  { code: 'SDG_09', name: 'Goal 9 - Industry, Innovation, and Infrastructure' },
  { code: 'SDG_10', name: 'Goal 10 - Reduced inequality' },
  { code: 'SDG_11', name: 'Goal 11 - Sustainable cities and communities' },
  { code: 'SDG_12', name: 'Goal 12 - Responsible consumption and production' },
  { code: 'SDG_13', name: 'Goal 13 - Climate action' },
  { code: 'SDG_14', name: 'Goal 14 - Life below water' },
  { code: 'SDG_15', name: 'Goal 15 - Life on land' },
  { code: 'SDG_16', name: 'Goal 16 - Peace, justice and strong institutions' },
  { code: 'SDG_17', name: 'Goal 17 - Partnership for the goals' },
];

/**
 * ADB Key Indicators Database (KIDB) adapter (UC-583).
 *
 * Asian Development Bank macroeconomic database covering 50 Asia-Pacific economies.
 * 700+ indicators across GDP, population, finance, trade, energy, environment, and SDGs.
 * SDMX v3.0 REST API (v4 path), no auth, open access, 20 req/min rate limit.
 *
 * Supported tools:
 *   adbkidb.dataflows_list  → static list of 62 KIDB dataflow categories
 *   adbkidb.indicators      → GET /api/dataflow/indicators/{code} (JSON)
 *   adbkidb.data            → GET /api/v4/sdmx/data/ADB,{flow}/A.{inds}.{ecos}?... (SDMX XML)
 *   adbkidb.economies       → static list of 50 ADB member economies
 */
export class AdbkidbAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'adbkidb', baseUrl: KIDB_BASE, timeoutMs: 15_000 });
  }

  /**
   * Override call() for adbkidb.data which returns SDMX XML (not JSON).
   * All other tools return JSON and use the default base class flow.
   */
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    if (req.toolId !== 'adbkidb.data') {
      // dataflows_list and economies return static data without HTTP calls
      if (req.toolId === 'adbkidb.dataflows_list' || req.toolId === 'adbkidb.economies') {
        return this.serveStatic(req);
      }
      return super.call(req);
    }
    return this.callSdmxData(req);
  }

  private serveStatic(req: ProviderRequest): ProviderRawResponse {
    const params = req.params as Record<string, unknown>;
    let body: unknown;

    if (req.toolId === 'adbkidb.dataflows_list') {
      const search = params.search ? String(params.search).toLowerCase() : '';
      const filtered = search
        ? KIDB_DATAFLOWS.filter(
            (d) => d.code.toLowerCase().includes(search) || d.name.toLowerCase().includes(search),
          )
        : KIDB_DATAFLOWS;
      const result: AdbkidbDataflowsOutput = { count: filtered.length, dataflows: filtered };
      body = result;
    } else {
      const search = params.search ? String(params.search).toLowerCase() : '';
      const filtered = search
        ? ADB_ECONOMIES.filter(
            (e) => e.code.toLowerCase().includes(search) || e.name.toLowerCase().includes(search),
          )
        : ADB_ECONOMIES;
      const result: AdbkidbEconomiesOutput = { count: filtered.length, economies: filtered };
      body = result;
    }

    return {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body,
      durationMs: 0,
      byteLength: 0,
    };
  }

  private async callSdmxData(req: ProviderRequest): Promise<ProviderRawResponse> {
    const built = this.buildRequest(req);
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delayMs));
        logger.info(
          { provider: this.provider, tool_id: req.toolId, attempt: attempt + 1, delay_ms: delayMs },
          'Retrying KIDB SDMX call',
        );
      }

      const start = performance.now();
      try {
        const response = await fetch(built.url, {
          method: built.method,
          headers: built.headers,
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });

        const bodyText = await response.text();
        const durationMs = Math.round(performance.now() - start);
        const byteLength = Buffer.byteLength(bodyText, 'utf8');

        if (response.status === 429) {
          throw {
            code: ProviderErrorCode.RATE_LIMIT,
            httpStatus: 429,
            message: 'KIDB rate limit exceeded (20 req/min)',
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        if (response.status >= 500) {
          throw {
            code: ProviderErrorCode.UNAVAILABLE,
            httpStatus: 502,
            message: `KIDB returned ${response.status}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        if (response.status >= 400) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `KIDB rejected request (HTTP ${response.status}): ${bodyText.slice(0, 200)}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs,
          };
        }

        const parsed = this.parseSdmxXml(bodyText, req);
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

  /** Parse SDMX Structure-Specific XML into clean JSON observations. */
  private parseSdmxXml(xml: string, req: ProviderRequest): AdbkidbDataOutput {
    const params = req.params as Record<string, unknown>;
    const economyCodes = (
      Array.isArray(params.economy_codes) ? params.economy_codes : [params.economy_codes]
    ).map(String);
    const indicatorCodes = (
      Array.isArray(params.indicator_codes) ? params.indicator_codes : [params.indicator_codes]
    ).map(String);
    const startYear = Number(params.start_year) || 2000;
    const endYear = Number(params.end_year) || new Date().getFullYear();

    // SDMX Structure-Specific XML: <Series ...><Obs TIME_PERIOD="..." OBS_VALUE="..." .../></Series>
    const observations: AdbkidbDataOutput['observations'] = [];
    const seriesRegex = /<Series\s([^>]+)>([\s\S]*?)<\/Series>/g;
    const obsRegex = /<Obs\s([^/]+)\/>/g;

    let seriesMatch: RegExpExecArray | null;
    while ((seriesMatch = seriesRegex.exec(xml)) !== null) {
      const seriesAttrs = this.parseXmlAttrs(seriesMatch[1]);
      const indicator = seriesAttrs['INDICATOR'] ?? '';
      const economy = seriesAttrs['ECONOMY_CODE'] ?? '';
      const seriesBody = seriesMatch[2];

      let obsMatch: RegExpExecArray | null;
      while ((obsMatch = obsRegex.exec(seriesBody)) !== null) {
        const a = this.parseXmlAttrs(obsMatch[1]);
        const rawValue = a['OBS_VALUE'];
        const value = rawValue !== undefined && rawValue !== '' ? parseFloat(rawValue) : null;
        observations.push({
          indicator,
          economy,
          period: a['TIME_PERIOD'] ?? '',
          value: value !== null && !isNaN(value) ? value : null,
          unit: a['UNIT'] ?? '',
          unit_mult: parseInt(a['UNIT_MULT'] ?? '0', 10),
          decimals: parseInt(a['DECIMALS'] ?? '0', 10),
          status: a['OBS_STATUS'] ?? '',
          source: a['DATA_SOURCE'] ?? '',
          footnote: a['FOOTNOTE'] ?? '',
        });
      }
    }

    return {
      dataflow: String(params.dataflow ?? ''),
      economies: economyCodes,
      indicators: indicatorCodes,
      start_year: startYear,
      end_year: endYear,
      observation_count: observations.length,
      observations,
    };
  }

  /** Parse XML attribute string into key/value map, handling HTML entities. */
  private parseXmlAttrs(attrStr: string): Record<string, string> {
    const result: Record<string, string> = {};
    const regex = /(\w+)="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(attrStr)) !== null) {
      result[m[1]] = m[2]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    }
    return result;
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
      case 'adbkidb.indicators': {
        const dataflow = encodeURIComponent(String(params.dataflow ?? ''));
        return {
          url: `${KIDB_BASE}/api/dataflow/indicators/${dataflow}`,
          method: 'GET',
          headers,
        };
      }

      case 'adbkidb.data': {
        const dataflow = String(params.dataflow ?? 'EO');
        const rawIndicators = Array.isArray(params.indicator_codes)
          ? params.indicator_codes
          : [params.indicator_codes ?? ''];
        const rawEconomies = Array.isArray(params.economy_codes)
          ? params.economy_codes
          : [params.economy_codes ?? ''];

        const indicators = rawIndicators
          .map(String)
          .filter(Boolean)
          .map(encodeURIComponent)
          .join('+');
        const economies = rawEconomies
          .map(String)
          .filter(Boolean)
          .map(encodeURIComponent)
          .join('+');

        const startYear = Number(params.start_year) || 2000;
        const endYear = Number(params.end_year) || new Date().getFullYear();

        const qp = new URLSearchParams({
          startPeriod: String(startYear),
          endPeriod: String(endYear),
          format: 'sdmx-structure-xml',
          version: '3.0',
        });

        return {
          url: `${KIDB_BASE}/api/v4/sdmx/data/ADB,${dataflow}/A.${indicators}.${economies}?${qp.toString()}`,
          method: 'GET',
          headers: { ...headers, Accept: 'application/xml' },
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
    if (req.toolId === 'adbkidb.indicators') {
      const rows = raw.body as AdbkidbIndicatorRaw[];
      const result: AdbkidbIndicatorsOutput = {
        dataflow: String((req.params as Record<string, unknown>).dataflow ?? ''),
        count: rows.length,
        indicators: rows.map((r) => ({
          code: r.code,
          name: r.name,
          description: r.description ?? null,
        })),
      };
      return result;
    }
    return raw.body;
  }
}
