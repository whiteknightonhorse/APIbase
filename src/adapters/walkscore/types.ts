/**
 * Walk Score API response types (UC-062).
 *
 * API host: api.walkscore.com
 * Auth: API Key (query param wsapikey)
 *
 * Endpoints:
 *   GET /score?format=json&address=...&lat=...&lon=...&transit=1&bike=1&wsapikey=KEY
 */

// ---------------------------------------------------------------------------
// Walk Score response
// ---------------------------------------------------------------------------

export interface WalkScoreResponse {
  status: number; // 1=success, 2=calculating, 40=invalid, 41=bad key, 42=IP block
  walkscore: number; // 0-100
  description: string; // e.g. "Walker's Paradise"
  updated: string; // date last updated
  logo_url: string;
  more_info_icon: string;
  more_info_link: string;
  ws_link: string;
  help_link: string;
  snapped_lat: number;
  snapped_lon: number;
  transit?: {
    score: number; // 0-100
    description: string; // e.g. "Excellent Transit"
    summary: string;
  };
  bike?: {
    score: number; // 0-100
    description: string; // e.g. "Very Bikeable"
  };
}
