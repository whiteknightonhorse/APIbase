import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  TheSportsDbTeamsResponse,
  TheSportsDbPlayersResponse,
  TheSportsDbEventsResponse,
} from './types';

/**
 * TheSportsDB adapter (UC-586).
 *
 * Supported tools (read-only):
 *   thesportsdb.team_search  → GET /searchteams.php?t={name}
 *   thesportsdb.player_search → GET /searchplayers.php?p={name}
 *   thesportsdb.events_past  → GET /eventspastleague.php?id={leagueId}
 *   thesportsdb.events_next  → GET /eventsnextleague.php?id={leagueId}
 *
 * Auth: None. Free public API key "3" baked into base URL.
 * Rate limit: Not documented; use conservatively.
 */
export class TheSportsDbAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'thesportsdb',
      baseUrl: 'https://www.thesportsdb.com/api/v1/json/3',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'thesportsdb.team_search': {
        const name = encodeURIComponent(String(params.name ?? ''));
        return { url: `${this.baseUrl}/searchteams.php?t=${name}`, method: 'GET', headers };
      }
      case 'thesportsdb.player_search': {
        const name = encodeURIComponent(String(params.name ?? ''));
        return { url: `${this.baseUrl}/searchplayers.php?p=${name}`, method: 'GET', headers };
      }
      case 'thesportsdb.events_past': {
        const id = encodeURIComponent(String(params.league_id ?? ''));
        return { url: `${this.baseUrl}/eventspastleague.php?id=${id}`, method: 'GET', headers };
      }
      case 'thesportsdb.events_next': {
        const id = encodeURIComponent(String(params.league_id ?? ''));
        return { url: `${this.baseUrl}/eventsnextleague.php?id=${id}`, method: 'GET', headers };
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

    switch (req.toolId) {
      case 'thesportsdb.team_search': {
        const data = body as unknown as TheSportsDbTeamsResponse;
        const teams = data.teams ?? [];
        return {
          count: teams.length,
          teams: teams.map((t) => ({
            id: t.idTeam,
            name: t.strTeam,
            short_name: t.strTeamShort,
            alternate_names: t.strTeamAlternate,
            sport: t.strSport,
            league: t.strLeague,
            league_id: t.idLeague,
            formed_year: t.intFormedYear,
            stadium: t.strStadium,
            location: t.strLocation,
            country: t.strCountry,
            website: t.strWebsite,
            description: t.strDescriptionEN ? t.strDescriptionEN.slice(0, 300) : null,
            badge_url: t.strBadge,
            banner_url: t.strBanner,
          })),
        };
      }

      case 'thesportsdb.player_search': {
        const data = body as unknown as TheSportsDbPlayersResponse;
        const players = data.player ?? [];
        return {
          count: players.length,
          players: players.map((p) => ({
            id: p.idPlayer,
            name: p.strPlayer,
            team: p.strTeam,
            team_id: p.idTeam,
            sport: p.strSport,
            nationality: p.strNationality,
            date_of_birth: p.dateBorn,
            status: p.strStatus,
            gender: p.strGender,
            position: p.strPosition,
            thumb_url: p.strThumb,
            cutout_url: p.strCutout,
          })),
        };
      }

      case 'thesportsdb.events_past':
      case 'thesportsdb.events_next': {
        const data = body as unknown as TheSportsDbEventsResponse;
        const events = data.events ?? [];
        return {
          count: events.length,
          events: events.map((e) => ({
            id: e.idEvent,
            name: e.strEvent,
            sport: e.strSport,
            league: e.strLeague,
            league_id: e.idLeague,
            season: e.strSeason,
            round: e.intRound,
            date: e.dateEvent,
            time: e.strTime,
            timestamp: e.strTimestamp,
            status: e.strStatus,
            home_team: e.strHomeTeam,
            home_team_id: e.idHomeTeam,
            home_score: e.intHomeScore,
            away_team: e.strAwayTeam,
            away_team_id: e.idAwayTeam,
            away_score: e.intAwayScore,
            result: e.strResult,
            venue: e.strVenue,
            country: e.strCountry,
            home_badge: e.strHomeTeamBadge,
            away_badge: e.strAwayTeamBadge,
          })),
        };
      }

      default:
        return body;
    }
  }
}
