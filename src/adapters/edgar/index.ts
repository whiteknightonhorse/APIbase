import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

const UA = 'APIbase/1.0 api@apibase.pro';

export class EdgarAdapter extends BaseAdapter {
  constructor() {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 1_048_576 });
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const headers = { 'User-Agent': UA, 'Accept': 'application/json' };

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

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

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
        'Revenues', 'NetIncomeLoss', 'Assets', 'Liabilities',
        'StockholdersEquity', 'EarningsPerShareBasic',
        'OperatingIncomeLoss', 'CashAndCashEquivalentsAtCarryingValue',
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

    return raw;
  }
}
