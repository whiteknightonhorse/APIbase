import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  OpenDotaPlayerSummaryResponse,
  OpenDotaPlayerMatchesResponse,
  OpenDotaMatchDetailResponse,
  OpenDotaProTeamsResponse,
} from './types';

const OPENDOTA_BASE = 'https://api.opendota.com/api';

/**
 * OpenDota adapter (UC-418).
 *
 * Dota 2 statistics API — players, matches, pro teams.
 * Auth: api_key query parameter.
 * Upstream cost: $0.0001/call (billed monthly at 3000 req/min, unlimited/day).
 * URL-encode integer params per flywheel [2026-04-05].
 *
 * Tools:
 *   opendota.player_summary  → GET /players/{account_id}
 *   opendota.player_matches  → GET /players/{account_id}/matches
 *   opendota.match_detail    → GET /matches/{match_id}
 *   opendota.pro_teams       → GET /teams
 */
export class OpenDotaAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'opendota',
      baseUrl: OPENDOTA_BASE,
    });
    this.apiKey = apiKey;
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
      'User-Agent': 'APIbase-Gateway/1.0',
    };

    switch (req.toolId) {
      case 'opendota.player_summary': {
        const accountId = encodeURIComponent(String(Number(params.account_id)));
        const qp = new URLSearchParams();
        qp.set('api_key', this.apiKey);
        return {
          url: `${OPENDOTA_BASE}/players/${accountId}?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'opendota.player_matches': {
        const accountId = encodeURIComponent(String(Number(params.account_id)));
        const limit = params.limit != null ? Math.min(Math.max(1, Number(params.limit)), 100) : 20;
        const qp = new URLSearchParams();
        qp.set('api_key', this.apiKey);
        qp.set('limit', String(limit));
        return {
          url: `${OPENDOTA_BASE}/players/${accountId}/matches?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'opendota.match_detail': {
        const matchId = encodeURIComponent(String(Number(params.match_id)));
        const qp = new URLSearchParams();
        qp.set('api_key', this.apiKey);
        return {
          url: `${OPENDOTA_BASE}/matches/${matchId}?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'opendota.pro_teams': {
        const qp = new URLSearchParams();
        qp.set('api_key', this.apiKey);
        return {
          url: `${OPENDOTA_BASE}/teams?${qp.toString()}`,
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

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'opendota.player_summary':
        return this.parsePlayerSummary(raw.body as OpenDotaPlayerSummaryResponse);
      case 'opendota.player_matches':
        return this.parsePlayerMatches(raw.body as OpenDotaPlayerMatchesResponse);
      case 'opendota.match_detail':
        return this.parseMatchDetail(raw.body as OpenDotaMatchDetailResponse);
      case 'opendota.pro_teams':
        return this.parseProTeams(raw.body as OpenDotaProTeamsResponse);
      default:
        return raw.body;
    }
  }

  private parsePlayerSummary(data: OpenDotaPlayerSummaryResponse) {
    // Private profiles may return minimal data — propagate as-is.
    if (!data || typeof data !== 'object') return data;
    const profile = data.profile;
    return {
      account_id: profile?.account_id ?? null,
      personaname: profile?.personaname ?? null,
      name: profile?.name ?? null,
      avatar: profile?.avatarfull ?? null,
      profileurl: profile?.profileurl ?? null,
      rank_tier: data.rank_tier ?? null,
      leaderboard_rank: data.leaderboard_rank ?? null,
      mmr_estimate: data.mmr_estimate ?? null,
      last_login: profile?.last_login ?? null,
      country_code: profile?.loccountrycode ?? null,
      is_contributor: profile?.is_contributor ?? null,
      is_subscriber: profile?.is_subscriber ?? null,
    };
  }

  private parsePlayerMatches(data: OpenDotaPlayerMatchesResponse) {
    if (!Array.isArray(data)) return data;
    return data.map((m) => ({
      match_id: m.match_id,
      hero_id: m.hero_id,
      start_time: m.start_time,
      duration: m.duration,
      game_mode: m.game_mode,
      lobby_type: m.lobby_type,
      kills: m.kills,
      deaths: m.deaths,
      assists: m.assists,
      radiant_win: m.radiant_win,
      player_slot: m.player_slot,
      win: m.player_slot < 128 ? m.radiant_win : !m.radiant_win,
      gold_per_min: m.gold_per_min,
      xp_per_min: m.xp_per_min,
      hero_damage: m.hero_damage,
      last_hits: m.last_hits,
      party_size: m.party_size ?? null,
      skill: m.skill ?? null,
    }));
  }

  private parseMatchDetail(data: OpenDotaMatchDetailResponse) {
    if (!data || typeof data !== 'object') return data;
    return {
      match_id: data.match_id,
      radiant_win: data.radiant_win,
      duration: data.duration,
      start_time: data.start_time,
      game_mode: data.game_mode,
      lobby_type: data.lobby_type,
      radiant_score: data.radiant_score,
      dire_score: data.dire_score,
      patch: data.patch,
      region: data.region,
      picks_bans: data.picks_bans ?? null,
      players: Array.isArray(data.players)
        ? data.players.map((p) => ({
            account_id: p.account_id ?? null,
            personaname: p.personaname ?? null,
            player_slot: p.player_slot,
            hero_id: p.hero_id,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            last_hits: p.last_hits,
            denies: p.denies,
            gold_per_min: p.gold_per_min,
            xp_per_min: p.xp_per_min,
            hero_damage: p.hero_damage,
            tower_damage: p.tower_damage,
            hero_healing: p.hero_healing,
            level: p.level,
            net_worth: p.net_worth,
            items: [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5],
            radiant: p.player_slot < 128,
          }))
        : [],
    };
  }

  private parseProTeams(data: OpenDotaProTeamsResponse) {
    if (!Array.isArray(data)) return data;
    return data.map((t) => ({
      team_id: t.team_id,
      name: t.name,
      tag: t.tag,
      rating: t.rating,
      wins: t.wins,
      losses: t.losses,
      last_match_time: t.last_match_time,
      logo_url: t.logo_url ?? null,
    }));
  }
}
