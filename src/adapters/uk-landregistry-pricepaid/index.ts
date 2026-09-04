import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  TransactionRecordListResponse,
  TransactionRecordRaw,
  TransactionDetailResponse,
  PricePaidSearchOutput,
  PricePaidTransaction,
  PricePaidAddress,
} from './types';

const PPI_BASE = 'https://landregistry.data.gov.uk/data/ppi';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * HM Land Registry Price Paid Data adapter (UC-678).
 *
 * Upstream is a Linked Data API (LDA) over an RDF triple store, not a plain
 * REST/CSV API — every response wraps a "format/version/result" envelope and
 * fields like propertyType/estateType are labelled resources, not strings.
 *
 * Supported tools:
 *   uk-landregistry-pricepaid.search_by_postcode -> GET /transaction-record.json?propertyAddress.postcode=...
 *   uk-landregistry-pricepaid.search_by_area      -> GET /transaction-record.json?propertyAddress.{town|county|district}=...
 *   uk-landregistry-pricepaid.get_transaction     -> GET /transaction/{id}.json
 *
 * IMPORTANT (verified live 2026-09-04): every filter exposed here (postcode,
 * town, county, district, min/max pricePaid, min/max transactionDate) is
 * indexed and returns in <2s even combined. Filtering by the *typed*
 * resource fields (propertyType=<URI>, estateType=<URI>, newBuild=<bool>) is
 * NOT exposed — combining any of those with a locality filter reliably hung
 * past 40s (an unindexed join against the RDF class dictionary on this
 * upstream), so they are deliberately left out of the tool surface rather
 * than shipping a parameter that hangs the pipeline's 10s adapter timeout.
 *
 * Auth: none. Data: HM Land Registry, Open Government Licence v3.0 — reuse
 * (incl. commercial) permitted with attribution. Docs:
 * https://landregistry.data.gov.uk/app/root/doc/ppd
 */
export class UkLandregistryPricepaidAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'uk-landregistry-pricepaid', baseUrl: PPI_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'uk-landregistry-pricepaid.search_by_postcode': {
        const postcode = String(params.postcode || '').trim();
        if (!postcode) {
          throw this.invalidInput(req.toolId, 'postcode is required');
        }
        const qs = this.buildListQuery(req.toolId, params);
        qs.set('propertyAddress.postcode', postcode);
        return { url: `${PPI_BASE}/transaction-record.json?${qs}`, method: 'GET', headers };
      }

      case 'uk-landregistry-pricepaid.search_by_area': {
        const town = String(params.town || '').trim();
        const county = String(params.county || '').trim();
        const district = String(params.district || '').trim();
        if (!town && !county && !district) {
          throw this.invalidInput(
            req.toolId,
            'At least one of town, county, or district is required',
          );
        }
        const qs = this.buildListQuery(req.toolId, params);
        if (town) qs.set('propertyAddress.town', town);
        if (county) qs.set('propertyAddress.county', county);
        if (district) qs.set('propertyAddress.district', district);
        return { url: `${PPI_BASE}/transaction-record.json?${qs}`, method: 'GET', headers };
      }

      case 'uk-landregistry-pricepaid.get_transaction': {
        const transactionId = String(params.transaction_id || '').trim();
        if (!transactionId) {
          throw this.invalidInput(req.toolId, 'transaction_id is required');
        }
        return {
          url: `${PPI_BASE}/transaction/${encodeURIComponent(transactionId)}.json`,
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
        };
    }
  }

  /** Shared page/pageSize/min-max price/date query params for the two list tools. */
  private buildListQuery(toolId: string, params: Record<string, unknown>): URLSearchParams {
    const qs = new URLSearchParams();

    const page = Math.max(0, Number(params.page) || 0);
    const pageSize = Math.min(Math.max(Number(params.page_size) || 20, 1), 100);
    qs.set('_page', String(page));
    qs.set('_pageSize', String(pageSize));

    if (params.min_price !== undefined && params.min_price !== null && params.min_price !== '') {
      qs.set('min-pricePaid', String(Math.max(0, Number(params.min_price) || 0)));
    }
    if (params.max_price !== undefined && params.max_price !== null && params.max_price !== '') {
      qs.set('max-pricePaid', String(Math.max(0, Number(params.max_price) || 0)));
    }

    const minDate = params.min_date !== undefined ? String(params.min_date).trim() : '';
    const maxDate = params.max_date !== undefined ? String(params.max_date).trim() : '';
    if (minDate) {
      if (!DATE_RE.test(minDate)) {
        throw this.invalidInput(toolId, 'min_date must be in YYYY-MM-DD format');
      }
      qs.set('min-transactionDate', minDate);
    }
    if (maxDate) {
      if (!DATE_RE.test(maxDate)) {
        throw this.invalidInput(toolId, 'max_date must be in YYYY-MM-DD format');
      }
      qs.set('max-transactionDate', maxDate);
    }

    return qs;
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const params = req.params as Record<string, unknown>;
    switch (req.toolId) {
      case 'uk-landregistry-pricepaid.search_by_postcode':
      case 'uk-landregistry-pricepaid.search_by_area':
        return this.parseSearch(raw.body as TransactionRecordListResponse, params);
      case 'uk-landregistry-pricepaid.get_transaction':
        return this.parseTransactionDetail(raw.body as TransactionDetailResponse, req);
      default:
        return raw.body;
    }
  }

  private parseSearch(
    data: TransactionRecordListResponse,
    params: Record<string, unknown>,
  ): PricePaidSearchOutput {
    const result = data?.result;
    const items = Array.isArray(result?.items) ? result.items : [];
    const page = result?.page ?? Math.max(0, Number(params.page) || 0);
    const pageSize =
      result?.itemsPerPage ?? Math.min(Math.max(Number(params.page_size) || 20, 1), 100);

    return {
      total_returned: items.length,
      page,
      page_size: pageSize,
      has_more: Boolean(result?.next) && items.length === pageSize,
      results: items.map((item) => this.toTransaction(item)),
    };
  }

  private parseTransactionDetail(
    data: TransactionDetailResponse,
    req: ProviderRequest,
  ): PricePaidTransaction {
    const items = Array.isArray(data?.result?.items) ? data.result.items : [];
    // The list contains both the abstract "Transaction" and its "current"
    // TransactionRecord — only the latter carries pricePaid/propertyAddress.
    const record = items.find(
      (item): item is TransactionRecordRaw =>
        (item as TransactionRecordRaw).pricePaid !== undefined,
    );
    if (!record) {
      throw this.invalidInput(
        req.toolId,
        'No transaction found for transaction_id. Call search_by_postcode or search_by_area to find a valid transaction_id.',
      );
    }
    return this.toTransaction(record);
  }

  private toTransaction(item: TransactionRecordRaw): PricePaidTransaction {
    const addr = item.propertyAddress;
    const address: PricePaidAddress = {
      paon: addr?.paon ?? null,
      saon: addr?.saon ?? null,
      street: addr?.street ?? null,
      locality: addr?.locality ?? null,
      town: addr?.town ?? null,
      district: addr?.district ?? null,
      county: addr?.county ?? null,
      postcode: addr?.postcode ?? null,
    };
    return {
      transaction_id: item.transactionId,
      price_paid: Number(item.pricePaid),
      transaction_date: item.transactionDate,
      property_type: item.propertyType?.prefLabel?.[0]?._value ?? null,
      estate_type: item.estateType?.prefLabel?.[0]?._value ?? null,
      new_build: Boolean(item.newBuild),
      address,
    };
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
