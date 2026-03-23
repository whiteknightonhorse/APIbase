import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class GleifAdapter extends BaseAdapter {
  constructor() {
    super({ timeout: 10_000, maxRetries: 2, maxResponseSize: 512_000 });
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const base = 'https://api.gleif.org/api/v1';
    const headers = { 'Accept': 'application/json' };

    switch (req.toolId) {
      case 'lei.search': {
        const qs = new URLSearchParams();
        qs.set('filter[entity.legalName]', String(params.name ?? ''));
        qs.set('page[size]', String(params.limit ?? 10));
        if (params.country) qs.set('filter[entity.legalAddress.country]', String(params.country));
        return { url: `${base}/lei-records?${qs}`, method: 'GET', headers };
      }

      case 'lei.lookup': {
        const lei = String(params.lei ?? '');
        return { url: `${base}/lei-records/${lei}`, method: 'GET', headers };
      }

      case 'lei.relationships': {
        const lei = String(params.lei ?? '');
        return { url: `${base}/lei-records/${lei}/direct-parent-relationship`, method: 'GET', headers };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (body?.errors) {
      return { ...raw, status: 502, body: { error: body.errors[0]?.detail ?? 'GLEIF request failed' } };
    }

    if (req.toolId === 'lei.search') {
      const items = (body.data ?? []).map((r: Record<string, unknown>) => {
        const attr = r.attributes as Record<string, unknown>;
        const entity = attr?.entity as Record<string, unknown>;
        const legalName = entity?.legalName as Record<string, unknown>;
        const legalAddr = entity?.legalAddress as Record<string, unknown>;
        const reg = attr?.registration as Record<string, unknown>;
        return {
          lei: attr?.lei,
          name: legalName?.name,
          country: legalAddr?.country,
          city: legalAddr?.city,
          status: reg?.status,
          entity_category: entity?.category,
          registration_date: reg?.initialRegistrationDate,
        };
      });
      return {
        ...raw,
        body: { entities: items, total: body.meta?.pagination?.total ?? 0, count: items.length },
      };
    }

    if (req.toolId === 'lei.lookup') {
      const attr = body.data?.attributes as Record<string, unknown>;
      const entity = attr?.entity as Record<string, unknown>;
      const legalName = entity?.legalName as Record<string, unknown>;
      const legalAddr = entity?.legalAddress as Record<string, unknown>;
      const hqAddr = entity?.headquartersAddress as Record<string, unknown>;
      const reg = attr?.registration as Record<string, unknown>;
      return {
        ...raw,
        body: {
          lei: attr?.lei,
          name: legalName?.name,
          legal_address: {
            street: (legalAddr?.addressLines as string[])?.[0],
            city: legalAddr?.city,
            region: legalAddr?.region,
            country: legalAddr?.country,
            postal_code: legalAddr?.postalCode,
          },
          headquarters: hqAddr ? {
            city: hqAddr.city,
            country: hqAddr.country,
          } : null,
          status: reg?.status,
          category: entity?.category,
          legal_form: (entity?.legalForm as Record<string, unknown>)?.id,
          registration_date: reg?.initialRegistrationDate,
          last_update: reg?.lastUpdateDate,
          next_renewal: reg?.nextRenewalDate,
        },
      };
    }

    if (req.toolId === 'lei.relationships') {
      const rel = body.data;
      if (!rel) {
        return { ...raw, body: { parent: null, message: 'No parent relationship found' } };
      }
      const attr = rel.attributes as Record<string, unknown> | undefined;
      const relship = attr?.relationship as Record<string, unknown> | undefined;
      return {
        ...raw,
        body: {
          child_lei: (relship?.startNode as Record<string, unknown>)?.id,
          parent_lei: (relship?.endNode as Record<string, unknown>)?.id,
          relationship_type: relship?.type,
          status: relship?.status,
        },
      };
    }

    return raw;
  }
}
