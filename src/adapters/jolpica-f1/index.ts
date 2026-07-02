import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { F1Race, F1RaceResult, F1DriverStanding, F1ConstructorStanding } from './types';

/**
 * Jolpica F1 adapter (UC-585).
 *
 * Wraps the Ergast-compatible Jolpica F1 REST API.
 * No auth required — public, open access.
 *
 * Supported tools:
 *   f1.races.schedule      → GET /ergast/f1/{season}.json
 *   f1.races.results       → GET /ergast/f1/{season}/{round}/results.json
 *   f1.standings.drivers   → GET /ergast/f1/{season}/driverstandings.json
 *   f1.standings.constructors → GET /ergast/f1/{season}/constructorstandings.json
 */
export class JolpicaF1Adapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'f1',
      baseUrl: 'https://api.jolpi.ca/ergast/f1',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
      Accept: 'application/json',
    };
    const season = params.season ? encodeURIComponent(String(params.season)) : 'current';
    const limit = Math.min(Number(params.limit) || 30, 100);
    const offset = Number(params.offset) || 0;

    switch (req.toolId) {
      case 'f1.races.schedule': {
        const qp = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        return { url: `${this.baseUrl}/${season}.json?${qp}`, method: 'GET', headers };
      }

      case 'f1.races.results': {
        const round = params.round ? encodeURIComponent(String(params.round)) : 'last';
        const qp = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        return {
          url: `${this.baseUrl}/${season}/${round}/results.json?${qp}`,
          method: 'GET',
          headers,
        };
      }

      case 'f1.standings.drivers': {
        const qp = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        return {
          url: `${this.baseUrl}/${season}/driverstandings.json?${qp}`,
          method: 'GET',
          headers,
        };
      }

      case 'f1.standings.constructors': {
        const qp = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        return {
          url: `${this.baseUrl}/${season}/constructorstandings.json?${qp}`,
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
    const body = raw.body as Record<string, unknown>;
    const mr = body.MRData as Record<string, unknown>;

    switch (req.toolId) {
      case 'f1.races.schedule':
        return this.parseSchedule(mr);
      case 'f1.races.results':
        return this.parseResults(mr);
      case 'f1.standings.drivers':
        return this.parseDriverStandings(mr);
      case 'f1.standings.constructors':
        return this.parseConstructorStandings(mr);
      default:
        return body;
    }
  }

  private parseSchedule(mr: Record<string, unknown>) {
    const table = mr.RaceTable as Record<string, unknown>;
    const races = (table?.Races as F1Race[]) ?? [];
    return {
      season: String(table?.season ?? ''),
      total: Number(mr.total ?? races.length),
      races: races.map((r) => ({
        round: Number(r.round),
        race_name: r.raceName,
        circuit_name: r.Circuit?.circuitName ?? '',
        circuit_id: r.Circuit?.circuitId ?? '',
        location: `${r.Circuit?.Location?.locality ?? ''}, ${r.Circuit?.Location?.country ?? ''}`,
        date: r.date,
        time: r.time ?? null,
        qualifying_date: r.Qualifying?.date ?? null,
        qualifying_time: r.Qualifying?.time ?? null,
        sprint_date: r.Sprint?.date ?? null,
        wiki_url: r.url,
      })),
    };
  }

  private parseResults(mr: Record<string, unknown>) {
    const table = mr.RaceTable as Record<string, unknown>;
    const races = (table?.Races as F1Race[]) ?? [];
    if (!races.length) return { race: null, results: [], total: 0 };
    const race = races[0] as F1Race & { Results?: F1RaceResult[] };
    const results = (race.Results as F1RaceResult[]) ?? [];
    return {
      race: {
        season: race.season,
        round: Number(race.round),
        race_name: race.raceName,
        circuit_name: race.Circuit?.circuitName ?? '',
        date: race.date,
        wiki_url: race.url,
      },
      results: results.map((r) => ({
        position: Number(r.position),
        driver_id: r.Driver?.driverId ?? '',
        driver_name: `${r.Driver?.givenName ?? ''} ${r.Driver?.familyName ?? ''}`.trim(),
        driver_number: r.number,
        driver_code: r.Driver?.code ?? '',
        constructor: r.Constructor?.name ?? '',
        grid: Number(r.grid),
        laps: Number(r.laps),
        status: r.status,
        points: Number(r.points),
        finish_time: r.Time?.time ?? null,
        fastest_lap_time: r.FastestLap?.Time?.time ?? null,
        fastest_lap_rank: r.FastestLap ? Number(r.FastestLap.rank) : null,
      })),
      total: results.length,
    };
  }

  private parseDriverStandings(mr: Record<string, unknown>) {
    const table = mr.StandingsTable as Record<string, unknown>;
    const lists = (table?.StandingsLists as Record<string, unknown>[]) ?? [];
    if (!lists.length) return { season: '', round: null, standings: [] };
    const list = lists[0];
    const standings = (list.DriverStandings as F1DriverStanding[]) ?? [];
    return {
      season: String(list.season ?? ''),
      round: list.round ? Number(list.round) : null,
      standings: standings.map((s) => ({
        position: Number(s.position),
        driver_id: s.Driver?.driverId ?? '',
        driver_name: `${s.Driver?.givenName ?? ''} ${s.Driver?.familyName ?? ''}`.trim(),
        driver_code: s.Driver?.code ?? '',
        nationality: s.Driver?.nationality ?? '',
        constructor: s.Constructors?.[0]?.name ?? '',
        points: Number(s.points),
        wins: Number(s.wins),
      })),
    };
  }

  private parseConstructorStandings(mr: Record<string, unknown>) {
    const table = mr.StandingsTable as Record<string, unknown>;
    const lists = (table?.StandingsLists as Record<string, unknown>[]) ?? [];
    if (!lists.length) return { season: '', round: null, standings: [] };
    const list = lists[0];
    const standings = (list.ConstructorStandings as F1ConstructorStanding[]) ?? [];
    return {
      season: String(list.season ?? ''),
      round: list.round ? Number(list.round) : null,
      standings: standings.map((s) => ({
        position: Number(s.position),
        constructor_id: s.Constructor?.constructorId ?? '',
        constructor_name: s.Constructor?.name ?? '',
        nationality: s.Constructor?.nationality ?? '',
        points: Number(s.points),
        wins: Number(s.wins),
      })),
    };
  }
}
