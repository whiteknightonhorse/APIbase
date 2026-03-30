import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  BDLGame,
  BDLTeam,
  BDLPlayer,
  BDLMeta,
  GamesOutput,
  TeamsOutput,
  PlayersOutput,
} from './types';

/**
 * BallDontLie adapter (UC-251).
 *
 * Supported tools:
 *   bdl.games   → GET /v1/games
 *   bdl.teams   → GET /v1/teams
 *   bdl.players → GET /v1/players
 *
 * Auth: Authorization header (key directly, no Bearer prefix).
 * Free: $0/sport, 5 req/min. NBA + NFL + more.
 */
export class BallDontLieAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'balldontlie',
      baseUrl: 'https://api.balldontlie.io',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Authorization: this.apiKey,
    };

    switch (req.toolId) {
      case 'bdl.games': {
        const qp = new URLSearchParams();
        if (params.date) qp.set('dates[]', String(params.date));
        if (params.season) qp.set('seasons[]', String(params.season));
        if (params.team_id) qp.set('team_ids[]', String(params.team_id));
        qp.set('per_page', String(Math.min(Number(params.limit) || 10, 25)));
        const sport = String(params.sport ?? 'nba').toLowerCase();
        const base = sport === 'nfl' ? '/nfl/v1/games' : '/v1/games';
        return { url: `${this.baseUrl}${base}?${qp.toString()}`, method: 'GET', headers };
      }

      case 'bdl.teams': {
        const qp = new URLSearchParams();
        if (params.conference) qp.set('conference', String(params.conference));
        if (params.division) qp.set('division', String(params.division));
        qp.set('per_page', String(Math.min(Number(params.limit) || 30, 30)));
        const sport = String(params.sport ?? 'nba').toLowerCase();
        const base = sport === 'nfl' ? '/nfl/v1/teams' : '/v1/teams';
        return { url: `${this.baseUrl}${base}?${qp.toString()}`, method: 'GET', headers };
      }

      case 'bdl.players': {
        const qp = new URLSearchParams();
        if (params.search) qp.set('search', String(params.search));
        if (params.team_id) qp.set('team_ids[]', String(params.team_id));
        qp.set('per_page', String(Math.min(Number(params.limit) || 10, 25)));
        return { url: `${this.baseUrl}/v1/players?${qp.toString()}`, method: 'GET', headers };
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
    const body = raw.body as Record<string, unknown>;
    const meta = body.meta as BDLMeta | undefined;

    switch (req.toolId) {
      case 'bdl.games':
        return this.parseGames(body.data as BDLGame[], meta);
      case 'bdl.teams':
        return this.parseTeams(body.data as BDLTeam[], meta);
      case 'bdl.players':
        return this.parsePlayers(body.data as BDLPlayer[], meta);
      default:
        return body;
    }
  }

  private parseGames(data: BDLGame[], meta?: BDLMeta): GamesOutput {
    const games = Array.isArray(data) ? data : [];
    return {
      games: games.map((g) => ({
        id: g.id,
        date: g.date ?? '',
        status: g.status ?? '',
        home_team: g.home_team?.full_name ?? '',
        home_score: g.home_team_score ?? 0,
        visitor_team: g.visitor_team?.full_name ?? '',
        visitor_score: g.visitor_team_score ?? 0,
        season: g.season ?? 0,
      })),
      total: meta?.total_count ?? games.length,
    };
  }

  private parseTeams(data: BDLTeam[], meta?: BDLMeta): TeamsOutput {
    const teams = Array.isArray(data) ? data : [];
    return {
      teams: teams.map((t) => ({
        id: t.id,
        name: t.full_name ?? t.name ?? '',
        abbreviation: t.abbreviation ?? '',
        city: t.city ?? '',
        conference: t.conference ?? '',
        division: t.division ?? '',
      })),
      total: meta?.total_count ?? teams.length,
    };
  }

  private parsePlayers(data: BDLPlayer[], meta?: BDLMeta): PlayersOutput {
    const players = Array.isArray(data) ? data : [];
    return {
      players: players.map((p) => ({
        id: p.id,
        name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
        position: p.position ?? '',
        jersey: p.jersey_number ?? '',
        team: p.team?.full_name ?? '',
      })),
      total: meta?.total_count ?? players.length,
    };
  }
}
