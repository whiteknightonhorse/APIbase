import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  LichessUserProfile,
  LichessTopPlayersResponse,
  LichessDailyPuzzleResponse,
} from './types';

/**
 * Lichess adapter (UC-416).
 *
 * Supported tools:
 *   lichess.user_profile   → GET /api/user/{username}
 *   lichess.top_players    → GET /api/player/top/{nb}/{perfType}
 *   lichess.daily_puzzle   → GET /api/puzzle/daily
 *
 * Auth: none — open API, public read endpoints.
 * Rate limit: ~20 req/s burst. User-Agent required on every request.
 */
export class LichessAdapter extends BaseAdapter {
  private static readonly LICHESS_BASE = 'https://lichess.org';
  private static readonly USER_AGENT = 'APIbase-Gateway/1.0 (https://apibase.pro)';

  constructor() {
    super({
      provider: 'lichess',
      baseUrl: LichessAdapter.LICHESS_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    switch (req.toolId) {
      case 'lichess.user_profile':
        return this.buildUserProfile(req.params as Record<string, unknown>);
      case 'lichess.top_players':
        return this.buildTopPlayers(req.params as Record<string, unknown>);
      case 'lichess.daily_puzzle':
        return this.buildDailyPuzzle();
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
      case 'lichess.user_profile': {
        const data = raw.body as LichessUserProfile;
        if (!data || typeof data !== 'object' || !data.username) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'User not found or invalid Lichess user profile response',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'lichess.top_players': {
        const data = raw.body as LichessTopPlayersResponse;
        if (!data || !Array.isArray(data.users)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Invalid Lichess top players response',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'lichess.daily_puzzle': {
        const data = raw.body as LichessDailyPuzzleResponse;
        if (!data || !data.puzzle || !data.game) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Invalid Lichess daily puzzle response',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private lichessHeaders(): Record<string, string> {
    return {
      'User-Agent': LichessAdapter.USER_AGENT,
      Accept: 'application/json',
    };
  }

  private buildUserProfile(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const username = encodeURIComponent(String(params.username));
    return {
      url: `${LichessAdapter.LICHESS_BASE}/api/user/${username}`,
      method: 'GET',
      headers: this.lichessHeaders(),
    };
  }

  private buildTopPlayers(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const nb = params.nb ?? 10;
    const perfType = String(params.perf_type);
    return {
      url: `${LichessAdapter.LICHESS_BASE}/api/player/top/${encodeURIComponent(String(nb))}/${encodeURIComponent(perfType)}`,
      method: 'GET',
      headers: this.lichessHeaders(),
    };
  }

  private buildDailyPuzzle(): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    return {
      url: `${LichessAdapter.LICHESS_BASE}/api/puzzle/daily`,
      method: 'GET',
      headers: this.lichessHeaders(),
    };
  }
}
