/**
 * Current UV Index API raw response types (UC-616).
 * https://currentuvindex.com/api
 *
 * No auth, no API key. CC BY 4.0 license (attribution required, commercial use OK).
 * Rate limit: 500 requests/IP/day (resets 00:00 UTC).
 */

export interface CurrentUvIndexPoint {
  time: string; // ISO 8601 UTC, e.g. "2026-08-27T09:00:00Z"
  uvi: number;
}

export interface CurrentUvIndexSuccessResponse {
  ok: true;
  latitude: number;
  longitude: number;
  now: CurrentUvIndexPoint;
  forecast: CurrentUvIndexPoint[]; // ~120 hours ahead, hourly
  history: CurrentUvIndexPoint[]; // up to 24 hours behind, hourly
}

export interface CurrentUvIndexErrorResponse {
  ok: false;
  message: string;
}

export type CurrentUvIndexResponse = CurrentUvIndexSuccessResponse | CurrentUvIndexErrorResponse;
