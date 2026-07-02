import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  JmaAreaConst,
  JmaForecastEntry,
  JmaOverview,
  JmaWarningResponse,
  JmaQuakeListEntry,
} from './types';

// JMA seismic intensity (shindo) code → human-readable label
const SHINDO_LABEL: Record<string, string> = {
  '1': 'Shindo 1',
  '2': 'Shindo 2',
  '3': 'Shindo 3',
  '4': 'Shindo 4',
  '5-': 'Shindo 5 (weak)',
  '5+': 'Shindo 5 (strong)',
  '6-': 'Shindo 6 (weak)',
  '6+': 'Shindo 6 (strong)',
  '7': 'Shindo 7',
};

function shindoLabel(code: string): string {
  return SHINDO_LABEL[code] ?? `Shindo ${code}`;
}

// Parse "+lat+lon-depthm/" coord string → numeric fields
function parseCoord(cod: string): {
  latitude: number | null;
  longitude: number | null;
  depth_km: number | null;
} {
  const m = cod.match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+)/);
  if (!m) return { latitude: null, longitude: null, depth_km: null };
  return {
    latitude: parseFloat(m[1]),
    longitude: parseFloat(m[2]),
    depth_km: Math.abs(parseFloat(m[3])) / 1000,
  };
}

/**
 * JMA Bosai adapter (UC-593).
 *
 * Tools (read-only):
 *   jma-bosai.forecast    → GET /bosai/forecast/data/forecast/{area_code}.json
 *   jma-bosai.overview    → GET /bosai/forecast/data/overview_forecast/{area_code}.json
 *   jma-bosai.warnings    → GET /bosai/warning/data/warning/{area_code}.json
 *   jma-bosai.earthquakes → GET /bosai/quake/data/list.json
 *   jma-bosai.areas       → GET /bosai/common/const/area.json
 *
 * Auth: None (Japanese Government open data — no API key, no registration).
 */
export class JmaBosaiAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'jma-bosai',
      baseUrl: 'https://www.jma.go.jp',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase.pro/1.0 (+https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'jma-bosai.forecast': {
        const areaCode = encodeURIComponent(String(params.area_code ?? '130000'));
        return {
          url: `${this.baseUrl}/bosai/forecast/data/forecast/${areaCode}.json`,
          method: 'GET',
          headers,
        };
      }
      case 'jma-bosai.overview': {
        const areaCode = encodeURIComponent(String(params.area_code ?? '130000'));
        return {
          url: `${this.baseUrl}/bosai/forecast/data/overview_forecast/${areaCode}.json`,
          method: 'GET',
          headers,
        };
      }
      case 'jma-bosai.warnings': {
        const areaCode = encodeURIComponent(String(params.area_code ?? '130000'));
        return {
          url: `${this.baseUrl}/bosai/warning/data/warning/${areaCode}.json`,
          method: 'GET',
          headers,
        };
      }
      case 'jma-bosai.earthquakes': {
        return {
          url: `${this.baseUrl}/bosai/quake/data/list.json`,
          method: 'GET',
          headers,
        };
      }
      case 'jma-bosai.areas': {
        return {
          url: `${this.baseUrl}/bosai/common/const/area.json`,
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
    const body = raw.body as unknown;
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'jma-bosai.forecast':
        return this.parseForecast(body as JmaForecastEntry[]);
      case 'jma-bosai.overview':
        return this.parseOverview(body as JmaOverview);
      case 'jma-bosai.warnings':
        return this.parseWarnings(body as JmaWarningResponse);
      case 'jma-bosai.earthquakes':
        return this.parseEarthquakes(body as JmaQuakeListEntry[], params);
      case 'jma-bosai.areas':
        return this.parseAreas(body as JmaAreaConst, params);
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Parsers
  // ---------------------------------------------------------------------------

  private parseForecast(data: JmaForecastEntry[]): unknown {
    if (!Array.isArray(data) || data.length === 0) return { forecasts: [] };

    const entry = data[0];
    const timeSeries = entry.timeSeries ?? [];

    // Series 0: weather codes + descriptions + winds + waves
    const weatherSeries = timeSeries[0];
    // Series 1: precipitation probability
    const popSeries = timeSeries[1];
    // Series 2: temperatures
    const tempSeries = timeSeries[2];

    const weatherAreas = weatherSeries?.areas ?? [];
    const popAreas = popSeries?.areas ?? [];
    const tempAreas = tempSeries?.areas ?? [];

    // Build area → pop lookup
    const popByCode: Record<string, string[]> = {};
    for (const a of popAreas) popByCode[a.area.code] = a.pops ?? [];

    const tempByCode: Record<string, string[]> = {};
    for (const a of tempAreas) tempByCode[a.area.code] = a.temps ?? [];

    const areas = weatherAreas.map((a) => {
      const times = weatherSeries.timeDefines ?? [];
      const pops = popByCode[a.area.code] ?? [];
      const temps = tempByCode[a.area.code] ?? [];

      return {
        area_code: a.area.code,
        area_name: a.area.name,
        periods: times.map((t, i) => ({
          time: t,
          weather_code: a.weatherCodes?.[i] ?? null,
          weather: a.weathers?.[i]?.replace(/\s+/g, ' ').trim() ?? null,
          wind: a.winds?.[i]?.replace(/\s+/g, ' ').trim() ?? null,
          wave: a.waves?.[i]?.replace(/\s+/g, ' ').trim() ?? null,
          pop_pct: pops[i] ? parseInt(pops[i], 10) : null,
          temp_c: temps[i] ? parseInt(temps[i], 10) : null,
        })),
      };
    });

    return {
      publishing_office: entry.publishingOffice,
      report_datetime: entry.reportDatetime,
      areas,
    };
  }

  private parseOverview(data: JmaOverview): unknown {
    return {
      publishing_office: data.publishingOffice,
      report_datetime: data.reportDatetime,
      target_area: data.targetArea,
      headline: data.headlineText,
      summary: data.text,
    };
  }

  private parseWarnings(data: JmaWarningResponse): unknown {
    const activeWarnings: { area_code: string; warning_code: string; status: string }[] = [];

    for (const areaType of data.areaTypes ?? []) {
      for (const area of areaType.areas ?? []) {
        for (const w of area.warnings ?? []) {
          if (w.code && w.status !== '発表警報・注意報はなし') {
            activeWarnings.push({
              area_code: area.code,
              warning_code: w.code,
              status: w.status,
            });
          }
        }
      }
    }

    return {
      report_datetime: data.reportDatetime,
      publishing_office: data.publishingOffice,
      headline: data.headlineText,
      active_warning_count: activeWarnings.length,
      active_warnings: activeWarnings,
    };
  }

  private parseEarthquakes(data: JmaQuakeListEntry[], params: Record<string, unknown>): unknown {
    const limit = Math.min(parseInt(String(params.limit ?? '20'), 10), 100);
    const minMag = params.min_magnitude != null ? parseFloat(String(params.min_magnitude)) : null;

    let items = data;
    if (minMag !== null) {
      const threshold = minMag;
      items = items.filter((q) => parseFloat(q.mag) >= threshold);
    }
    items = items.slice(0, limit);

    return {
      count: items.length,
      earthquakes: items.map((q) => {
        const coord = parseCoord(q.cod);
        return {
          event_id: q.eid,
          occurred_at: q.at,
          reported_at: q.rdt,
          epicenter_name: q.en_anm,
          epicenter_name_ja: q.anm,
          magnitude: parseFloat(q.mag),
          max_intensity: shindoLabel(q.maxi),
          max_intensity_raw: q.maxi,
          latitude: coord.latitude,
          longitude: coord.longitude,
          depth_km: coord.depth_km,
          title: q.en_ttl,
        };
      }),
    };
  }

  private parseAreas(data: JmaAreaConst, params: Record<string, unknown>): unknown {
    let offices = Object.entries(data.offices ?? {}).map(([code, o]) => ({
      code,
      name_ja: o.name,
      name_en: o.enName,
      office_name: o.officeName,
      parent_code: o.parent,
    }));

    const filter = params.name_filter ? String(params.name_filter).toLowerCase() : null;
    if (filter) {
      offices = offices.filter(
        (o) => o.name_en.toLowerCase().includes(filter) || o.name_ja.includes(filter),
      );
    }

    return {
      total_offices: offices.length,
      offices,
    };
  }
}
