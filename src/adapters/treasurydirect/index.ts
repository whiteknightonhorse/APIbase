import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  TreasurySecurityRecord,
  AuctionResultsOutput,
  UpcomingAuctionsOutput,
  CusipSearchOutput,
  TipsRatesOutput,
} from './types';

const API_BASE = 'https://www.treasurydirect.gov/TA_WS/securities';

const VALID_TYPES = new Set(['Bill', 'Note', 'Bond', 'TIPS', 'FRN', 'CMB']);

/**
 * TreasuryDirect TA_WS adapter (UC-536).
 *
 * US Treasury auction data: Bills, Notes, Bonds, TIPS, FRN auctions.
 * Auth: None. US Government open data, unlimited, commercial use allowed.
 */
export class TreasuryDirectAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'treasurydirect', baseUrl: API_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase.pro/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'treasurydirect.auction_results': {
        const secType = String(params.type || 'Bill');
        const days = Math.min(Math.max(Number(params.days) || 30, 1), 365);
        const endpoint = params.auctioned === false ? 'announced' : 'auctioned';
        const qs = new URLSearchParams({ type: secType, days: String(days), format: 'json' });
        return { url: `${API_BASE}/${endpoint}?${qs}`, method: 'GET', headers };
      }

      case 'treasurydirect.upcoming_auctions': {
        return { url: `${API_BASE}/upcoming?format=json`, method: 'GET', headers };
      }

      case 'treasurydirect.search_cusip': {
        const cusip = encodeURIComponent(
          String(params.cusip || '')
            .trim()
            .toUpperCase(),
        );
        return {
          url: `${API_BASE}/search?cusip=${cusip}&format=json`,
          method: 'GET',
          headers,
        };
      }

      case 'treasurydirect.tips_rates': {
        const days = Math.min(Math.max(Number(params.days) || 365), 1825);
        const qs = new URLSearchParams({ type: 'TIPS', days: String(days), format: 'json' });
        return { url: `${API_BASE}/auctioned?${qs}`, method: 'GET', headers };
      }

      default:
        throw {
          code: ProviderErrorCode.UNAVAILABLE,
          httpStatus: 502,
          message: `Unknown toolId: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as TreasurySecurityRecord[] | TreasurySecurityRecord;
    const records: TreasurySecurityRecord[] = Array.isArray(body) ? body : [body];

    switch (req.toolId) {
      case 'treasurydirect.auction_results': {
        const params = req.params as Record<string, unknown>;
        const secType = String(params.type || 'Bill');
        const days = Math.min(Math.max(Number(params.days) || 30, 1), 365);
        const out: AuctionResultsOutput = {
          type: secType,
          days,
          count: records.length,
          securities: records.map((r) => normalizeRecord(r)),
        };
        return out;
      }

      case 'treasurydirect.upcoming_auctions': {
        const out: UpcomingAuctionsOutput = {
          count: records.length,
          upcoming: records.map((r) => normalizeRecord(r)),
        };
        return out;
      }

      case 'treasurydirect.search_cusip': {
        const params = req.params as Record<string, unknown>;
        const out: CusipSearchOutput = {
          cusip: String(params.cusip || '')
            .trim()
            .toUpperCase(),
          count: records.length,
          securities: records.map((r) => normalizeRecord(r)),
        };
        return out;
      }

      case 'treasurydirect.tips_rates': {
        const params = req.params as Record<string, unknown>;
        const days = Math.min(Math.max(Number(params.days) || 365), 1825);
        const out: TipsRatesOutput = {
          days,
          count: records.length,
          tips: records.map((r) => ({
            cusip: r.cusip ?? '',
            securityTerm: r.securityTerm ?? '',
            auctionDate: r.auctionDate ?? '',
            issueDate: r.issueDate ?? '',
            maturityDate: r.maturityDate ?? '',
            interestRate: r.interestRate ?? '',
            highYield: r.highYield ?? '',
            refCpiOnIssueDate: r.refCpiOnIssueDate ?? '',
            indexRatioOnIssueDate: r.indexRatioOnIssueDate ?? '',
            bidToCoverRatio: r.bidToCoverRatio ?? '',
            totalAccepted: r.totalAccepted ?? '',
          })),
        };
        return out;
      }

      default:
        return raw.body;
    }
  }
}

function normalizeRecord(r: TreasurySecurityRecord): TreasurySecurityRecord {
  // Return only populated fields to keep response compact
  const out: TreasurySecurityRecord = {} as TreasurySecurityRecord;
  for (const [k, v] of Object.entries(r)) {
    if (v !== '' && v !== null && v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export function validateSecurityType(type: string): boolean {
  return VALID_TYPES.has(type);
}
