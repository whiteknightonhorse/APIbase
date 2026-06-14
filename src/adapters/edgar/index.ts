import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

const UA = 'APIbase/1.0 api@apibase.pro';

export class EdgarAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'edgar', baseUrl: 'https://data.sec.gov', maxRetries: 2 });
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const headers = { 'User-Agent': UA, Accept: 'application/json' };

    switch (req.toolId) {
      case 'edgar.company_search': {
        const q = encodeURIComponent(String(params.query ?? ''));
        return {
          url: `https://efts.sec.gov/LATEST/search-index?q=${q}&from=0&size=${params.limit ?? 10}`,
          method: 'GET',
          headers,
        };
      }

      case 'edgar.filings': {
        const cik = String(params.cik ?? '').padStart(10, '0');
        return {
          url: `https://data.sec.gov/submissions/CIK${cik}.json`,
          method: 'GET',
          headers,
        };
      }

      case 'edgar.company_facts': {
        const cik = String(params.cik ?? '').padStart(10, '0');
        return {
          url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
          method: 'GET',
          headers,
        };
      }

      case 'edgar.xbrl_concept': {
        const cik = String(params.cik ?? '').padStart(10, '0');
        const taxonomy = encodeURIComponent(String(params.taxonomy ?? 'us-gaap'));
        const tag = encodeURIComponent(String(params.tag));
        return {
          url: `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/${taxonomy}/${tag}.json`,
          method: 'GET',
          headers,
        };
      }

      case 'edgar.xbrl_frames': {
        const taxonomy = encodeURIComponent(String(params.taxonomy ?? 'us-gaap'));
        const tag = encodeURIComponent(String(params.tag));
        const unit = encodeURIComponent(String(params.unit ?? 'USD'));
        const period = encodeURIComponent(String(params.period));
        return {
          url: `https://data.sec.gov/api/xbrl/frames/${taxonomy}/${tag}/${unit}/${period}.json`,
          method: 'GET',
          headers,
        };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body = typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (req.toolId === 'edgar.company_search') {
      const hits = body?.hits?.hits ?? [];
      const results = hits.map((h: Record<string, unknown>) => {
        const src = h._source as Record<string, unknown> | undefined;
        const names = (src?.display_names as string[]) ?? [];
        const ciks = (src?.ciks as string[]) ?? [];
        return {
          name: names[0] ?? null,
          cik: ciks[0] ?? null,
          form_type: (src?.file_type as string) ?? (src?.form_type as string) ?? null,
          filing_date: src?.file_date ?? src?.period_ending ?? null,
          file_number: ((src?.file_num as string[]) ?? [])[0] ?? null,
        };
      });
      return {
        ...raw,
        body: {
          results,
          total: body?.hits?.total?.value ?? 0,
          count: results.length,
        },
      };
    }

    if (req.toolId === 'edgar.filings') {
      const recent = body?.filings?.recent ?? {};
      const count = Math.min((recent.accessionNumber ?? []).length, 20);
      const filings = [];
      for (let i = 0; i < count; i++) {
        filings.push({
          accession_number: recent.accessionNumber?.[i],
          form: recent.form?.[i],
          filing_date: recent.filingDate?.[i],
          report_date: recent.reportDate?.[i],
          primary_document: recent.primaryDocument?.[i],
          description: recent.primaryDocDescription?.[i],
        });
      }
      return {
        ...raw,
        body: {
          company: body?.name,
          cik: body?.cik,
          ticker: (body?.tickers ?? [])[0] ?? null,
          sic: body?.sic,
          sic_description: body?.sicDescription,
          state: body?.stateOfIncorporation,
          filings,
          total_filings: (recent.accessionNumber ?? []).length,
        },
      };
    }

    if (req.toolId === 'edgar.company_facts') {
      const facts = body?.facts ?? {};
      const usGaap = facts['us-gaap'] ?? {};
      const summary: Record<string, unknown> = {};
      const importantMetrics = [
        'Revenues',
        'NetIncomeLoss',
        'Assets',
        'Liabilities',
        'StockholdersEquity',
        'EarningsPerShareBasic',
        'OperatingIncomeLoss',
        'CashAndCashEquivalentsAtCarryingValue',
      ];
      for (const metric of importantMetrics) {
        const data = usGaap[metric];
        if (data?.units) {
          const units = Object.values(data.units) as Array<Array<Record<string, unknown>>>;
          const values = (units[0] ?? []).slice(-5).map((v: Record<string, unknown>) => ({
            value: v.val,
            period: v.end,
            form: v.form,
          }));
          if (values.length > 0) {
            summary[metric] = { label: data.label, recent: values };
          }
        }
      }
      return {
        ...raw,
        body: {
          company: body?.entityName,
          cik: body?.cik,
          facts: summary,
          total_metrics: Object.keys(usGaap).length,
        },
      };
    }

    if (req.toolId === 'edgar.xbrl_concept') {
      const units = body?.units ?? {};
      const allValues: Record<string, unknown>[] = [];
      for (const unitArr of Object.values(units) as Record<string, unknown>[][]) {
        if (Array.isArray(unitArr)) allValues.push(...unitArr);
      }
      // Return last 20 values sorted by end date
      const sorted = allValues
        .sort((a, b) => String(b.end ?? '').localeCompare(String(a.end ?? '')))
        .slice(0, 20);
      return {
        ...raw,
        body: {
          company: body?.entityName,
          cik: body?.cik,
          tag: body?.tag,
          taxonomy: body?.taxonomy,
          total_records: allValues.length,
          records: sorted.map((v) => ({
            value: v.val,
            period_end: v.end,
            period_start: v.start,
            form: v.form,
            filed: v.filed,
            fiscal_year: v.fy,
            fiscal_period: v.fp,
          })),
        },
      };
    }

    if (req.toolId === 'edgar.xbrl_frames') {
      const data = (body?.data ?? []) as Record<string, unknown>[];
      // Return top 25 by value descending
      const sorted = data.sort((a, b) => Number(b.val ?? 0) - Number(a.val ?? 0)).slice(0, 25);
      return {
        ...raw,
        body: {
          tag: body?.tag,
          taxonomy: body?.taxonomy,
          period: body?.ccp,
          unit: body?.uom,
          total_companies: data.length,
          companies: sorted.map((r) => ({
            company: r.entityName,
            cik: r.cik,
            value: r.val,
            accession: r.accn,
            filed: r.filed,
          })),
        },
      };
    }

    return raw;
  }
}
