import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * NASA Exoplanet Archive TAP adapter (UC-456).
 *
 * Supported tools (Phase 1, read-only):
 *   nasaexoplanet.search         → ADQL query on `ps` table
 *   nasaexoplanet.planet_detail  → exact planet lookup by name
 *   nasaexoplanet.habitable      → Earth-like candidates in the habitable zone
 *   nasaexoplanet.stats          → discovery statistics (method, year, facility)
 *
 * Auth: None (US Gov / Caltech IPAC open access, 17 USC §105).
 * Protocol: TAP (Table Access Protocol) via GET ?query=<ADQL>&format=json
 */
export class NasaExoplanetAdapter extends BaseAdapter {
  private readonly tapUrl: string;

  constructor() {
    super({
      provider: 'nasaexoplanet',
      baseUrl: 'https://exoplanetarchive.ipac.caltech.edu',
    });
    this.tapUrl = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase.pro/1.0 (https://apibase.pro)',
    };

    let adql: string;

    switch (req.toolId) {
      case 'nasaexoplanet.search':
        adql = this.buildSearchQuery(params);
        break;
      case 'nasaexoplanet.planet_detail':
        adql = this.buildPlanetDetailQuery(params);
        break;
      case 'nasaexoplanet.habitable':
        adql = this.buildHabitableQuery(params);
        break;
      case 'nasaexoplanet.stats':
        adql = this.buildStatsQuery(params);
        break;
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

    const qs = new URLSearchParams({ query: adql, format: 'json' });
    return { url: `${this.tapUrl}?${qs.toString()}`, method: 'GET', headers };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const rows = raw.body as Record<string, unknown>[];

    switch (req.toolId) {
      case 'nasaexoplanet.search':
      case 'nasaexoplanet.planet_detail':
      case 'nasaexoplanet.habitable':
        return {
          planets: rows,
          count: rows.length,
          source: 'NASA Exoplanet Archive — Planetary Systems (ps)',
          archive_url: 'https://exoplanetarchive.ipac.caltech.edu',
        };

      case 'nasaexoplanet.stats': {
        const params = req.params as Record<string, unknown>;
        const groupBy = String(params.group_by ?? 'method');
        return {
          stats: rows,
          count: rows.length,
          group_by: groupBy,
          total_confirmed: rows.reduce(
            (s: number, r) => s + (Number((r as Record<string, unknown>).cnt) || 0),
            0,
          ),
          source: 'NASA Exoplanet Archive — Planetary Systems (ps)',
          archive_url: 'https://exoplanetarchive.ipac.caltech.edu',
        };
      }

      default:
        return rows;
    }
  }

  // ---------------------------------------------------------------------------
  // Private query builders
  // ---------------------------------------------------------------------------

  private buildSearchQuery(params: Record<string, unknown>): string {
    const limit = Math.min(Number(params.limit ?? 20), 100);
    const conditions: string[] = ['default_flag=1'];

    if (params.planet_name) {
      const escaped = String(params.planet_name).replace(/'/g, "''");
      conditions.push(`LOWER(pl_name) LIKE LOWER('%${escaped}%')`);
    }
    if (params.host_name) {
      const escaped = String(params.host_name).replace(/'/g, "''");
      conditions.push(`LOWER(hostname) LIKE LOWER('%${escaped}%')`);
    }
    if (params.discovery_method) {
      const escaped = String(params.discovery_method).replace(/'/g, "''");
      conditions.push(`discoverymethod='${escaped}'`);
    }
    if (params.disc_year_min) conditions.push(`disc_year>=${Number(params.disc_year_min)}`);
    if (params.disc_year_max) conditions.push(`disc_year<=${Number(params.disc_year_max)}`);
    if (params.radius_min) conditions.push(`pl_rade>=${Number(params.radius_min)}`);
    if (params.radius_max) conditions.push(`pl_rade<=${Number(params.radius_max)}`);
    if (params.mass_min) conditions.push(`pl_bmasse>=${Number(params.mass_min)}`);
    if (params.mass_max) conditions.push(`pl_bmasse<=${Number(params.mass_max)}`);

    const where = conditions.join(' AND ');
    return (
      `SELECT TOP ${limit} ` +
      `pl_name,hostname,pl_orbper,pl_rade,pl_bmasse,pl_eqt,disc_year,` +
      `discoverymethod,disc_facility,sy_dist,st_spectype,pl_orbsmax,pl_insol,pl_controv_flag ` +
      `FROM ps WHERE ${where} ORDER BY disc_year DESC`
    );
  }

  private buildPlanetDetailQuery(params: Record<string, unknown>): string {
    const name = String(params.planet_name ?? '').replace(/'/g, "''");
    return (
      `SELECT ` +
      `pl_name,hostname,pl_orbper,pl_rade,pl_bmasse,pl_eqt,disc_year,` +
      `discoverymethod,disc_facility,sy_dist,st_spectype,pl_orbsmax,pl_insol,` +
      `pl_controv_flag,st_teff,st_rad,st_mass,rastr,decstr,rowupdate ` +
      `FROM ps WHERE LOWER(pl_name)=LOWER('${name}')`
    );
  }

  private buildHabitableQuery(params: Record<string, unknown>): string {
    const limit = Math.min(Number(params.limit ?? 20), 100);
    const radius_max = Number(params.radius_max ?? 2.0);
    const radius_min = Number(params.radius_min ?? 0.5);
    const temp_min = Number(params.temp_min ?? 180);
    const temp_max = Number(params.temp_max ?? 310);

    const conditions = [
      `pl_rade BETWEEN ${radius_min} AND ${radius_max}`,
      `pl_eqt BETWEEN ${temp_min} AND ${temp_max}`,
      `pl_rade IS NOT NULL`,
      `pl_eqt IS NOT NULL`,
    ];

    return (
      `SELECT TOP ${limit} ` +
      `pl_name,hostname,pl_rade,pl_bmasse,pl_orbper,pl_eqt,pl_orbsmax,pl_insol,` +
      `disc_year,discoverymethod,disc_facility,sy_dist,st_spectype ` +
      `FROM pscomppars WHERE ${conditions.join(' AND ')} ORDER BY pl_rade ASC`
    );
  }

  private buildStatsQuery(params: Record<string, unknown>): string {
    const groupBy = String(params.group_by ?? 'method');
    const limit = Math.min(Number(params.limit ?? 50), 100);

    switch (groupBy) {
      case 'year':
        return (
          `SELECT TOP ${limit} disc_year,COUNT(*) AS cnt FROM ps ` +
          `WHERE default_flag=1 AND disc_year IS NOT NULL ` +
          `GROUP BY disc_year ORDER BY disc_year ASC`
        );
      case 'facility':
        return (
          `SELECT TOP ${limit} disc_facility,COUNT(*) AS cnt FROM ps ` +
          `WHERE default_flag=1 AND disc_facility IS NOT NULL ` +
          `GROUP BY disc_facility ORDER BY cnt DESC`
        );
      case 'method':
      default:
        return (
          `SELECT TOP ${limit} discoverymethod,COUNT(*) AS cnt FROM ps ` +
          `WHERE default_flag=1 GROUP BY discoverymethod ORDER BY cnt DESC`
        );
    }
  }
}
