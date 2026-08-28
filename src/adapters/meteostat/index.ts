import { gunzipSync } from 'node:zlib';
import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

const DATA_BASE = 'https://data.meteostat.net';
const BULK_BASE = 'https://bulk.meteostat.net/v2';
const HEADERS = { 'User-Agent': 'APIbase/1.0 (https://apibase.pro)' };

const EARTH_RADIUS_KM = 6371;
const HOURLY_MAX_WINDOW_DAYS = 7;
const MIN_YEAR = 1900;

const OBSERVATION_NOTE =
  'Column meanings: temp=mean air temperature °C, tmin/tmax=daily min/max temperature °C, ' +
  'txmn/txmx=monthly mean of daily min/max °C, rhum=relative humidity %, prcp=precipitation mm, ' +
  'snwd=snow depth mm, wdir=wind direction degrees, wspd=average wind speed km/h, ' +
  'wpgt=peak wind gust km/h, pres=sea-level air pressure hPa, tsun=sunshine duration minutes, ' +
  'cldc=cloud cover oktas (0-8), coco=weather condition code. A null value means that parameter ' +
  'was not measured or reported for that period.';

interface MeteostatStation {
  id: string;
  active?: boolean;
  name: Record<string, string>;
  country: string;
  region?: string;
  location: { latitude: number; longitude: number; elevation: number };
  timezone?: string;
}

/**
 * Meteostat adapter (UC-627).
 *
 * The official Meteostat JSON API (meteostat.p.rapidapi.com) requires a paid RapidAPI key and
 * is out of scope. Instead this adapter wraps Meteostat's free, no-signup "Data Access"
 * interface — confirmed live and documented at https://dev.meteostat.net/data as requiring no
 * API key:
 *   - data.meteostat.net/{hourly,daily}/{year}/{station}.csv.gz — annual per-station CSV dumps
 *   - data.meteostat.net/monthly/{station}.csv.gz               — full monthly history
 *   - data.meteostat.net/stations/{station}.json                — station metadata
 *   - bulk.meteostat.net/v2/stations/lite.json.gz                — full active-station directory
 *
 * All station/time-series files are gzip-compressed (`Content-Type: application/x-gzip`, no
 * `Content-Encoding` header), so responses are never JSON over the wire and BaseAdapter's
 * JSON-parsing fetch path cannot be used — call() is fully overridden (same pattern as the
 * GEBCO/usgs-mrds adapters) to fetch raw bytes and gunzip them with node:zlib.
 *
 * A full year of hourly data is ~1.8MB as JSON (exceeds the 512KB normalized response limit),
 * so hourly_data requires a bounded start/end date window (max 7 days) instead of a full year.
 *
 * Auth: None (CC BY 4.0 open data, aggregated from NOAA/DWD/Environment Canada and other public
 * meteorological services; no resale restriction beyond attribution — see /license, /terms).
 */
export class MeteostatAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'meteostat', baseUrl: DATA_BASE });
  }

  // All logic lives in call() — buildRequest/parseResponse are required stubs.
  protected buildRequest(_req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    throw new Error('MeteostatAdapter.buildRequest() should not be called directly');
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = (req.params ?? {}) as Record<string, unknown>;

    switch (req.toolId) {
      case 'meteostat.stations_nearby':
        return this.respond(await this.handleStationsNearby(params, req), start);
      case 'meteostat.station_info':
        return this.respond(await this.handleStationInfo(params, req), start);
      case 'meteostat.daily_data':
        return this.respond(await this.handleDailyData(params, req), start);
      case 'meteostat.monthly_data':
        return this.respond(await this.handleMonthlyData(params, req), start);
      case 'meteostat.hourly_data':
        return this.respond(await this.handleHourlyData(params, req), start);
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

  // ---------------------------------------------------------------------------
  // Tool handlers
  // ---------------------------------------------------------------------------

  private async handleStationsNearby(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const lat = requireLat(params.lat, req);
    const lon = requireLon(params.lon, req);
    const radiusKm = clampNumber(params.radius_km, 1, 500, 100);
    const limit = clampInt(params.limit, 1, 50, 10);

    const text = await this.fetchGzipText(`${BULK_BASE}/stations/lite.json.gz`, req);
    let stations: MeteostatStation[];
    try {
      stations = JSON.parse(text) as MeteostatStation[];
    } catch {
      throw upstreamInvalid(this.provider, req, 'station directory');
    }

    const nearby = stations
      .map((s) => ({
        id: s.id,
        name: s.name?.en ?? Object.values(s.name ?? {})[0] ?? s.id,
        country: s.country,
        region: s.region ?? null,
        latitude: s.location.latitude,
        longitude: s.location.longitude,
        elevation_m: s.location.elevation,
        distance_km:
          Math.round(haversineKm(lat, lon, s.location.latitude, s.location.longitude) * 10) / 10,
      }))
      .filter((s) => s.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, limit);

    return {
      center: { lat, lon },
      radius_km: radiusKm,
      count: nearby.length,
      stations: nearby,
    };
  }

  private async handleStationInfo(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const stationId = requireStationId(params.station_id, req);
    return this.fetchJson(`${DATA_BASE}/stations/${encodeURIComponent(stationId)}.json`, req);
  }

  private async handleDailyData(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const stationId = requireStationId(params.station_id, req);
    const year = requireYear(params.year, req);

    const text = await this.fetchGzipText(
      `${DATA_BASE}/daily/${year}/${encodeURIComponent(stationId)}.csv.gz`,
      req,
      `No daily data found for station "${stationId}" in ${year}.`,
    );
    const { header, rows } = parseCsv(text);
    const idx = columnIndex(header);

    const days = rows.map((r) => ({
      date: `${r[idx.year]}-${pad2(r[idx.month])}-${pad2(r[idx.day])}`,
      temp: numOrNull(r[idx.temp]),
      tmin: numOrNull(r[idx.tmin]),
      tmax: numOrNull(r[idx.tmax]),
      rhum: numOrNull(r[idx.rhum]),
      prcp: numOrNull(r[idx.prcp]),
      snwd: numOrNull(r[idx.snwd]),
      wspd: numOrNull(r[idx.wspd]),
      wpgt: numOrNull(r[idx.wpgt]),
      pres: numOrNull(r[idx.pres]),
      tsun: numOrNull(r[idx.tsun]),
      cldc: numOrNull(r[idx.cldc]),
    }));

    return { station_id: stationId, year, unit_note: OBSERVATION_NOTE, count: days.length, days };
  }

  private async handleMonthlyData(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const stationId = requireStationId(params.station_id, req);

    const text = await this.fetchGzipText(
      `${DATA_BASE}/monthly/${encodeURIComponent(stationId)}.csv.gz`,
      req,
      `No monthly data found for station "${stationId}".`,
    );
    const { header, rows } = parseCsv(text);
    const idx = columnIndex(header);

    const months = rows.map((r) => ({
      year: numOrNull(r[idx.year]),
      month: numOrNull(r[idx.month]),
      temp: numOrNull(r[idx.temp]),
      tmin: numOrNull(r[idx.tmin]),
      tmax: numOrNull(r[idx.tmax]),
      txmn: numOrNull(r[idx.txmn]),
      txmx: numOrNull(r[idx.txmx]),
      prcp: numOrNull(r[idx.prcp]),
      pres: numOrNull(r[idx.pres]),
      tsun: numOrNull(r[idx.tsun]),
    }));

    return {
      station_id: stationId,
      unit_note: OBSERVATION_NOTE,
      count: months.length,
      months,
    };
  }

  private async handleHourlyData(
    params: Record<string, unknown>,
    req: ProviderRequest,
  ): Promise<unknown> {
    const stationId = requireStationId(params.station_id, req);
    const startDate = requireDate(params.start_date, 'start_date', req);
    const endDate = requireDate(params.end_date, 'end_date', req);

    if (endDate.getTime() < startDate.getTime()) {
      throw inputRejected(
        this.provider,
        req,
        'Parameter "end_date" must not be before "start_date".',
      );
    }
    if (startDate.getUTCFullYear() !== endDate.getUTCFullYear()) {
      throw inputRejected(
        this.provider,
        req,
        'Parameter "start_date" and "end_date" must fall within the same calendar year.',
      );
    }
    const windowDays = (endDate.getTime() - startDate.getTime()) / 86_400_000 + 1;
    if (windowDays > HOURLY_MAX_WINDOW_DAYS) {
      throw inputRejected(
        this.provider,
        req,
        `Date range must not exceed ${HOURLY_MAX_WINDOW_DAYS} days (got ${windowDays}). ` +
          'A full year of hourly data exceeds the response size limit — narrow the range, or ' +
          'use meteostat.daily_data for a full-year summary.',
      );
    }

    const year = startDate.getUTCFullYear();
    const text = await this.fetchGzipText(
      `${DATA_BASE}/hourly/${year}/${encodeURIComponent(stationId)}.csv.gz`,
      req,
      `No hourly data found for station "${stationId}" in ${year}.`,
    );
    const { header, rows } = parseCsv(text);
    const idx = columnIndex(header);

    const startMs = startDate.getTime();
    const endMs = endDate.getTime() + 86_400_000; // inclusive of the whole end day

    const hours = rows
      .map((r) => {
        const y = Number(r[idx.year]);
        const mo = Number(r[idx.month]);
        const d = Number(r[idx.day]);
        const h = Number(r[idx.hour]);
        const rowMs = Date.UTC(y, mo - 1, d, h);
        return { rowMs, y, mo, d, h, r };
      })
      .filter((row) => row.rowMs >= startMs && row.rowMs < endMs)
      .map(({ y, mo, d, h, r }) => ({
        time: `${y}-${pad2(mo)}-${pad2(d)}T${pad2(h)}:00`,
        temp: numOrNull(r[idx.temp]),
        rhum: numOrNull(r[idx.rhum]),
        prcp: numOrNull(r[idx.prcp]),
        snwd: numOrNull(r[idx.snwd]),
        wdir: numOrNull(r[idx.wdir]),
        wspd: numOrNull(r[idx.wspd]),
        wpgt: numOrNull(r[idx.wpgt]),
        pres: numOrNull(r[idx.pres]),
        tsun: numOrNull(r[idx.tsun]),
        cldc: numOrNull(r[idx.cldc]),
        coco: numOrNull(r[idx.coco]),
      }));

    return {
      station_id: stationId,
      start_date: params.start_date,
      end_date: params.end_date,
      unit_note: OBSERVATION_NOTE,
      count: hours.length,
      hours,
    };
  }

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------

  private respond(body: unknown, start: number): ProviderRawResponse {
    return {
      status: 200,
      headers: {},
      body,
      durationMs: Math.round(performance.now() - start),
      byteLength: JSON.stringify(body).length,
    };
  }

  private async fetchGzipText(
    url: string,
    req: ProviderRequest,
    notFoundMessage?: string,
  ): Promise<string> {
    const response = await this.rawFetch(url, req, notFoundMessage);
    const buf = Buffer.from(await response.arrayBuffer());
    try {
      return gunzipSync(buf).toString('utf8');
    } catch {
      throw upstreamInvalid(this.provider, req, 'gzip payload');
    }
  }

  private async fetchJson(url: string, req: ProviderRequest): Promise<unknown> {
    const response = await this.rawFetch(url, req, `Station not found.`);
    try {
      return await response.json();
    } catch {
      throw upstreamInvalid(this.provider, req, 'station metadata');
    }
  }

  private async rawFetch(
    url: string,
    req: ProviderRequest,
    notFoundMessage?: string,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: HEADERS,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      throw {
        code: isTimeout ? ProviderErrorCode.TIMEOUT : ProviderErrorCode.UNAVAILABLE,
        httpStatus: isTimeout ? 504 : 502,
        message: isTimeout
          ? `Provider call timed out after ${this.timeoutMs}ms`
          : `Provider connection failed: ${error instanceof Error ? error.message : 'unknown'}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    if (response.status === 404) {
      throw inputRejected(this.provider, req, notFoundMessage ?? 'Resource not found.');
    }
    if (response.status === 429) {
      throw {
        code: ProviderErrorCode.RATE_LIMIT,
        httpStatus: 429,
        message: 'Meteostat data service rate limit exceeded',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    if (response.status >= 500) {
      throw {
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: `Meteostat data service returned ${response.status}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }
    if (response.status >= 400) {
      throw inputRejected(
        this.provider,
        req,
        `Meteostat data service rejected the request (HTTP ${response.status}).`,
      );
    }

    return response;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedCsv {
  header: string[];
  rows: string[][];
}

function parseCsv(text: string): ParsedCsv {
  const lines = text.split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { header: [], rows: [] };
  }
  const header = lines[0] === undefined ? [] : lines[0].split(',');
  const rows = lines.slice(1).map((l) => l.split(','));
  return { header, rows };
}

function columnIndex(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  header.forEach((name, i) => {
    idx[name] = i;
  });
  return idx;
}

function numOrNull(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pad2(value: string | number): string {
  return String(value).padStart(2, '0');
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function inputRejected(provider: string, req: ProviderRequest, message: string) {
  return {
    code: ProviderErrorCode.INPUT_REJECTED,
    httpStatus: 422,
    message,
    provider,
    toolId: req.toolId,
    durationMs: 0,
  };
}

function upstreamInvalid(provider: string, req: ProviderRequest, what: string) {
  return {
    code: ProviderErrorCode.INVALID_RESPONSE,
    httpStatus: 502,
    message: `Meteostat data service returned an unparseable ${what}.`,
    provider,
    toolId: req.toolId,
    durationMs: 0,
  };
}

function requireLat(value: unknown, req: ProviderRequest): number {
  const lat = Number(value);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw inputRejected('meteostat', req, 'Parameter "lat" must be a number between -90 and 90.');
  }
  return lat;
}

function requireLon(value: unknown, req: ProviderRequest): number {
  const lon = Number(value);
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw inputRejected('meteostat', req, 'Parameter "lon" must be a number between -180 and 180.');
  }
  return lon;
}

function requireStationId(value: unknown, req: ProviderRequest): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 20) {
    throw inputRejected(
      'meteostat',
      req,
      'Parameter "station_id" must be a non-empty Meteostat station ID string (e.g. "10637").',
    );
  }
  return value;
}

function requireYear(value: unknown, req: ProviderRequest): number {
  const year = Number(value);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < MIN_YEAR || year > currentYear) {
    throw inputRejected(
      'meteostat',
      req,
      `Parameter "year" must be an integer between ${MIN_YEAR} and ${currentYear}.`,
    );
  }
  return year;
}

function requireDate(value: unknown, field: string, req: ProviderRequest): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw inputRejected(
      'meteostat',
      req,
      `Parameter "${field}" must be a date in YYYY-MM-DD format.`,
    );
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw inputRejected('meteostat', req, `Parameter "${field}" is not a valid calendar date.`);
  }
  return date;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
