import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class CompaniesHouseAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 512_000 });
    this.apiKey = apiKey;
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const base = 'https://api.company-information.service.gov.uk';
    const auth = Buffer.from(`${this.apiKey}:`).toString('base64');
    const headers = { 'Authorization': `Basic ${auth}` };

    switch (req.toolId) {
      case 'ukcompany.search': {
        const q = encodeURIComponent(String(params.query ?? ''));
        const limit = params.limit ?? 10;
        return { url: `${base}/search/companies?q=${q}&items_per_page=${limit}`, method: 'GET', headers };
      }

      case 'ukcompany.details': {
        const num = String(params.company_number ?? '');
        return { url: `${base}/company/${num}`, method: 'GET', headers };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (body?.errors) {
      return { ...raw, status: 502, body: { error: body.errors[0]?.error ?? 'Companies House request failed' } };
    }

    if (req.toolId === 'ukcompany.search') {
      const items = (body.items ?? []).map((c: Record<string, unknown>) => {
        const addr = c.address as Record<string, unknown> | undefined;
        return {
          company_number: c.company_number,
          title: c.title,
          company_type: c.company_type,
          company_status: c.company_status,
          date_of_creation: c.date_of_creation,
          address: addr ? `${addr.premises ?? ''} ${addr.address_line_1 ?? ''}, ${addr.locality ?? ''} ${addr.postal_code ?? ''}`.trim() : null,
        };
      });
      return { ...raw, body: { companies: items, total: body.total_results ?? items.length, count: items.length } };
    }

    if (req.toolId === 'ukcompany.details') {
      const addr = body.registered_office_address as Record<string, unknown> | undefined;
      return {
        ...raw,
        body: {
          company_number: body.company_number,
          company_name: body.company_name,
          type: body.type,
          status: body.company_status,
          date_of_creation: body.date_of_creation,
          jurisdiction: body.jurisdiction,
          sic_codes: body.sic_codes,
          registered_address: addr ? `${addr.address_line_1 ?? ''}, ${addr.locality ?? ''} ${addr.postal_code ?? ''}, ${addr.country ?? ''}`.trim() : null,
          accounts_next_due: body.accounts?.next_due,
          confirmation_next_due: body.confirmation_statement?.next_due,
          has_charges: body.has_charges,
          has_insolvency_history: body.has_insolvency_history,
        },
      };
    }

    return raw;
  }
}
