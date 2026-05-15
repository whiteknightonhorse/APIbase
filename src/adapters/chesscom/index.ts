import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  ChesscomPlayerProfile,
  ChesscomPlayerStats,
  ChesscomTitledPlayersResponse,
} from './types';

/**
 * Chess.com Public Data API adapter (UC-417).
 *
 * Supported tools:
 *   chesscom.player_profile  → GET /pub/player/{username}
 *   chesscom.player_stats    → GET /pub/player/{username}/stats
 *   chesscom.titled_players  → GET /pub/titled/{title}
 *
 * Auth: none — open public data API, no API key required.
 * Rate limit: be polite; User-Agent header MANDATORY (403 without it).
 */
export class ChesscomAdapter extends BaseAdapter {
  private static readonly CHESSCOM_BASE = 'https://api.chess.com';
  private static readonly USER_AGENT = 'APIbase-Gateway/1.0 (https://apibase.pro)';

  constructor() {
    super({
      provider: 'chesscom',
      baseUrl: ChesscomAdapter.CHESSCOM_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    switch (req.toolId) {
      case 'chesscom.player_profile':
        return this.buildPlayerProfile(req.params as Record<string, unknown>);
      case 'chesscom.player_stats':
        return this.buildPlayerStats(req.params as Record<string, unknown>);
      case 'chesscom.titled_players':
        return this.buildTitledPlayers(req.params as Record<string, unknown>);
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
      case 'chesscom.player_profile': {
        const data = raw.body as ChesscomPlayerProfile;
        if (!data || typeof data !== 'object' || !data.username) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Username not found',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'chesscom.player_stats': {
        const data = raw.body as ChesscomPlayerStats;
        if (!data || typeof data !== 'object') {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Username not found',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return data;
      }
      case 'chesscom.titled_players': {
        const data = raw.body as ChesscomTitledPlayersResponse;
        if (!data || !Array.isArray(data.players)) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 502,
            message: 'Invalid Chess.com titled players response',
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

  private chesscomHeaders(): Record<string, string> {
    return {
      'User-Agent': ChesscomAdapter.USER_AGENT,
      Accept: 'application/json',
    };
  }

  private buildPlayerProfile(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const username = encodeURIComponent(String(params.username));
    return {
      url: `${ChesscomAdapter.CHESSCOM_BASE}/pub/player/${username}`,
      method: 'GET',
      headers: this.chesscomHeaders(),
    };
  }

  private buildPlayerStats(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const username = encodeURIComponent(String(params.username));
    return {
      url: `${ChesscomAdapter.CHESSCOM_BASE}/pub/player/${username}/stats`,
      method: 'GET',
      headers: this.chesscomHeaders(),
    };
  }

  private buildTitledPlayers(params: Record<string, unknown>): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const title = encodeURIComponent(String(params.title));
    return {
      url: `${ChesscomAdapter.CHESSCOM_BASE}/pub/titled/${title}`,
      method: 'GET',
      headers: this.chesscomHeaders(),
    };
  }
}
