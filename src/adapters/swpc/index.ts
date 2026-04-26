import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SwpcKindexEntry,
  SwpcAuroraResponse,
  SwpcSolarWindEntry,
  SwpcSolarRegion,
} from './types';

/**
 * NOAA SWPC (Space Weather Prediction Center) adapter (UC-396).
 *
 * Supported tools (read-only, no auth):
 *   swpc.k_index        → /json/planetary_k_index_1m.json
 *   swpc.aurora         → /json/ovation_aurora_latest.json
 *   swpc.solar_wind     → /json/rtsw/rtsw_wind_1m.json
 *   swpc.solar_regions  → /json/solar_regions.json
 *
 * Auth: None (US Gov NODD license, commercial use OK).
 *
 * Notes:
 * - rtsw_wind_1m.json is ~1.8 MB so we override the default 1 MB pipeline
 *   limit with maxResponseBytes: 2_500_000.
 * - aurora response has 65,160 grid cells (~919 KB). We aggregate into
 *   10-degree latitude bands so the agent payload stays under ~5 KB.
 * - solar_wind data is ordered newest-first; k_index is ordered oldest-first.
 */
export class SwpcAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'swpc',
      baseUrl: 'https://services.swpc.noaa.gov',
      maxResponseBytes: 2_500_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'swpc.k_index':
        return {
          url: `${this.baseUrl}/json/planetary_k_index_1m.json`,
          method: 'GET',
          headers,
        };
      case 'swpc.aurora':
        return {
          url: `${this.baseUrl}/json/ovation_aurora_latest.json`,
          method: 'GET',
          headers,
        };
      case 'swpc.solar_wind':
        return {
          url: `${this.baseUrl}/json/rtsw/rtsw_wind_1m.json`,
          method: 'GET',
          headers,
        };
      case 'swpc.solar_regions':
        return {
          url: `${this.baseUrl}/json/solar_regions.json`,
          method: 'GET',
          headers,
        };
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'swpc.k_index':
        return parseKindex(raw.body, req.params as Record<string, unknown>);
      case 'swpc.aurora':
        return parseAurora(raw.body);
      case 'swpc.solar_wind':
        return parseSolarWind(raw.body, req.params as Record<string, unknown>);
      case 'swpc.solar_regions':
        return parseSolarRegions(raw.body, req.params as Record<string, unknown>);
      default:
        return raw.body;
    }
  }
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function kpToStorm(kp: number): { severity: string; level: string; description: string } {
  if (kp >= 9)
    return {
      severity: 'G5',
      level: 'Extreme',
      description:
        'Severe geomagnetic storm — widespread voltage control problems, satellite navigation degraded for hours.',
    };
  if (kp >= 8)
    return {
      severity: 'G4',
      level: 'Severe',
      description:
        'Severe geomagnetic storm — voltage control problems, satellite navigation degraded.',
    };
  if (kp >= 7)
    return {
      severity: 'G3',
      level: 'Strong',
      description:
        'Strong geomagnetic storm — voltage corrections may be required, false alarms triggered on protection devices.',
    };
  if (kp >= 6)
    return {
      severity: 'G2',
      level: 'Moderate',
      description:
        'Moderate geomagnetic storm — high-latitude power systems may experience voltage alarms.',
    };
  if (kp >= 5)
    return {
      severity: 'G1',
      level: 'Minor',
      description:
        'Minor geomagnetic storm — weak power grid fluctuations possible, aurora visible at high latitudes.',
    };
  return { severity: 'none', level: 'Quiet', description: 'No geomagnetic storm in progress.' };
}

function parseKindex(body: unknown, params: Record<string, unknown>): unknown {
  const entries = (body as SwpcKindexEntry[]) ?? [];
  if (entries.length === 0) {
    return { latest: null, recent: [], note: 'No K-index data available' };
  }
  // K-index file is ordered oldest-first; latest is the last entry.
  const latest = entries[entries.length - 1];
  const requestedPoints = Math.max(1, Math.min(120, Number(params.points ?? 30)));
  const recent = entries.slice(-requestedPoints);
  // Compute max kp_index over the entire window for storm-watch context.
  let maxKp = 0;
  let maxAt = '';
  for (const e of entries) {
    if (typeof e.kp_index === 'number' && e.kp_index > maxKp) {
      maxKp = e.kp_index;
      maxAt = e.time_tag;
    }
  }
  return {
    latest: {
      time_tag: latest.time_tag,
      kp_index: latest.kp_index,
      estimated_kp: latest.estimated_kp,
      kp: latest.kp,
      storm: kpToStorm(latest.kp_index),
    },
    window_max: {
      kp_index: maxKp,
      time_tag: maxAt,
      storm: kpToStorm(maxKp),
    },
    window_minutes: entries.length,
    recent: recent.map((e) => ({
      time_tag: e.time_tag,
      kp_index: e.kp_index,
      estimated_kp: e.estimated_kp,
    })),
  };
}

interface AuroraBand {
  lat_min: number;
  lat_max: number;
  max_aurora_pct: number;
  cells_with_visibility: number;
}

function parseAurora(body: unknown): unknown {
  const aurora = body as SwpcAuroraResponse;
  const coords = aurora?.coordinates ?? [];

  // Aggregate the 65,160-cell grid into 18 latitude bands of 10° each.
  const bandSize = 10;
  const bands = new Map<number, { max: number; count: number }>();
  for (const cell of coords) {
    const lat = cell[1];
    const pct = cell[2];
    if (pct <= 0) continue;
    const bandStart = Math.floor(lat / bandSize) * bandSize;
    const cur = bands.get(bandStart);
    if (!cur) {
      bands.set(bandStart, { max: pct, count: 1 });
    } else {
      cur.max = Math.max(cur.max, pct);
      cur.count += 1;
    }
  }

  const bandList: AuroraBand[] = [...bands.entries()]
    .map(([start, v]) => ({
      lat_min: start,
      lat_max: start + bandSize,
      max_aurora_pct: v.max,
      cells_with_visibility: v.count,
    }))
    .sort((a, b) => b.max_aurora_pct - a.max_aurora_pct);

  // Find the strongest bands in northern and southern hemispheres separately.
  const northern = bandList.filter((b) => b.lat_min >= 0).slice(0, 3);
  const southern = bandList.filter((b) => b.lat_max <= 0).slice(0, 3);

  return {
    observation_time: aurora?.['Observation Time'],
    forecast_time: aurora?.['Forecast Time'],
    data_format: aurora?.['Data Format'],
    summary: {
      total_visible_cells: bandList.reduce((s, b) => s + b.cells_with_visibility, 0),
      strongest_band_pct: bandList[0]?.max_aurora_pct ?? 0,
      strongest_band_lat: bandList[0] ? `${bandList[0].lat_min}°..${bandList[0].lat_max}°` : null,
    },
    top_northern_bands: northern,
    top_southern_bands: southern,
    all_bands_with_visibility: bandList,
  };
}

function parseSolarWind(body: unknown, params: Record<string, unknown>): unknown {
  const entries = (body as SwpcSolarWindEntry[]) ?? [];
  if (entries.length === 0) return { latest: null, recent: [] };

  // rtsw_wind_1m.json is ordered NEWEST-first. Latest = entries[0].
  const latest = entries[0];
  const requestedPoints = Math.max(1, Math.min(60, Number(params.points ?? 20)));
  const recent = entries.slice(0, requestedPoints);

  return {
    latest: {
      time_tag: latest.time_tag,
      source: latest.source,
      proton_speed_kms: latest.proton_speed,
      proton_density_per_cm3: latest.proton_density,
      proton_temperature_k: latest.proton_temperature,
      quality: latest.overall_quality,
    },
    window_minutes: entries.length,
    recent: recent.map((e) => ({
      time_tag: e.time_tag,
      proton_speed_kms: e.proton_speed,
      proton_density_per_cm3: e.proton_density,
      proton_temperature_k: e.proton_temperature,
      quality: e.overall_quality,
    })),
  };
}

function parseSolarRegions(body: unknown, params: Record<string, unknown>): unknown {
  const all = (body as SwpcSolarRegion[]) ?? [];
  const limit = Math.max(1, Math.min(50, Number(params.limit ?? 20)));

  // Sort by observed_date desc, then by region number desc to surface the most recent active regions
  const sorted = [...all].sort((a, b) => {
    if (a.observed_date < b.observed_date) return 1;
    if (a.observed_date > b.observed_date) return -1;
    return b.region - a.region;
  });

  const trimmed = sorted.slice(0, limit).map((r) => ({
    region: r.region,
    observed_date: r.observed_date,
    location: r.location,
    latitude: r.latitude,
    longitude: r.longitude,
    area: r.area,
    spot_class: r.spot_class,
    number_spots: r.number_spots,
    mag_class: r.mag_class,
    status: r.status,
    xray_events: {
      c: r.c_xray_events,
      m: r.m_xray_events,
      x: r.x_xray_events,
    },
    flare_probability_pct: {
      c: r.c_flare_probability,
      m: r.m_flare_probability,
      x: r.x_flare_probability,
    },
    first_date: r.first_date,
  }));

  return {
    total_regions_observed: all.length,
    returned: trimmed.length,
    regions: trimmed,
  };
}
