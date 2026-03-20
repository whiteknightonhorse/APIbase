import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

/**
 * API-Sports adapter (UC-089).
 * Multi-sport data: football, basketball, NFL, baseball, hockey + more.
 * Auth: x-apisports-key header. Free: 100 req/day per sport.
 */
export class ApiSportsAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'apisports', baseUrl: '' });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { 'x-apisports-key': this.apiKey };

    switch (req.toolId) {
      case 'sports.football_fixtures': {
        const qs = new URLSearchParams();
        if (p.date) qs.set('date', String(p.date));
        if (p.league) qs.set('league', String(p.league));
        if (p.season) qs.set('season', String(p.season));
        if (p.team) qs.set('team', String(p.team));
        if (p.live) qs.set('live', 'all');
        return { url: `https://v3.football.api-sports.io/fixtures?${qs}`, method: 'GET', headers: h };
      }
      case 'sports.football_standings': {
        const qs = new URLSearchParams();
        qs.set('league', String(p.league));
        qs.set('season', String(p.season ?? 2025));
        return { url: `https://v3.football.api-sports.io/standings?${qs}`, method: 'GET', headers: h };
      }
      case 'sports.football_leagues': {
        const qs = new URLSearchParams();
        if (p.country) qs.set('country', String(p.country));
        if (p.search) qs.set('search', String(p.search));
        return { url: `https://v3.football.api-sports.io/leagues?${qs}`, method: 'GET', headers: h };
      }
      case 'sports.basketball_games': {
        const qs = new URLSearchParams();
        if (p.date) qs.set('date', String(p.date));
        if (p.league) qs.set('league', String(p.league));
        if (p.season) qs.set('season', String(p.season));
        if (p.team) qs.set('team', String(p.team));
        return { url: `https://v1.basketball.api-sports.io/games?${qs}`, method: 'GET', headers: h };
      }
      default:
        throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    const results = (body.response ?? []) as Array<Record<string, unknown>>;
    const total = body.results as number ?? 0;

    switch (req.toolId) {
      case 'sports.football_fixtures':
        return {
          total,
          fixtures: results.slice(0, 20).map((f) => {
            const teams = (f.teams ?? {}) as Record<string, Record<string, unknown>>;
            const goals = (f.goals ?? {}) as Record<string, unknown>;
            const fixture = (f.fixture ?? {}) as Record<string, unknown>;
            const league = (f.league ?? {}) as Record<string, unknown>;
            return {
              id: fixture.id,
              date: fixture.date,
              status: (fixture.status as Record<string, unknown>)?.long,
              league: league.name,
              country: league.country,
              home: teams.home?.name,
              away: teams.away?.name,
              score_home: goals.home,
              score_away: goals.away,
            };
          }),
        };

      case 'sports.football_standings':
        return {
          standings: results.slice(0, 1).map((r) => {
            const league = (r.league ?? {}) as Record<string, unknown>;
            const standings = (league.standings ?? []) as Array<Array<Record<string, unknown>>>;
            return {
              league: league.name,
              country: league.country,
              season: league.season,
              table: (standings[0] ?? []).map((t) => ({
                rank: t.rank,
                team: (t.team as Record<string, unknown>)?.name,
                points: t.points,
                played: (t.all as Record<string, unknown>)?.played,
                won: (t.all as Record<string, unknown>)?.win,
                drawn: (t.all as Record<string, unknown>)?.draw,
                lost: (t.all as Record<string, unknown>)?.lose,
                goals_for: ((t.all as Record<string, unknown>)?.goals as Record<string, unknown>)?.for,
                goals_against: ((t.all as Record<string, unknown>)?.goals as Record<string, unknown>)?.against,
              })),
            };
          }),
        };

      case 'sports.football_leagues':
        return {
          total,
          leagues: results.slice(0, 20).map((r) => {
            const league = (r.league ?? {}) as Record<string, unknown>;
            const country = (r.country ?? {}) as Record<string, unknown>;
            return { id: league.id, name: league.name, type: league.type, country: country.name, logo: league.logo };
          }),
        };

      case 'sports.basketball_games':
        return {
          total,
          games: results.slice(0, 20).map((g) => {
            const teams = (g.teams ?? {}) as Record<string, Record<string, unknown>>;
            const scores = (g.scores ?? {}) as Record<string, Record<string, unknown>>;
            const league = (g.league ?? {}) as Record<string, unknown>;
            return {
              id: g.id,
              date: g.date,
              status: (g.status ?? {}) as Record<string, unknown>,
              league: league.name,
              country: league.country,
              home: teams.home?.name,
              away: teams.away?.name,
              score_home: scores.home?.total,
              score_away: scores.away?.total,
            };
          }),
        };

      default:
        return { total, data: results.slice(0, 20) };
    }
  }
}
