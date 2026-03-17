/**
 * IGDB (Internet Games Database) response types (UC-039).
 *
 * API host: api.igdb.com/v4
 * Auth: OAuth2 Twitch Client Credentials + Client-ID header
 * All endpoints: POST with text/plain body (Apicalypse query language)
 * Free tier: unlimited (4 req/sec)
 */

// ---------------------------------------------------------------------------
// Game Search / Details (POST /games)
// ---------------------------------------------------------------------------

export interface IgdbGame {
  id: number;
  name?: string;
  slug?: string;
  summary?: string;
  storyline?: string;
  rating?: number;
  aggregated_rating?: number;
  total_rating?: number;
  first_release_date?: number; // Unix timestamp
  genres?: Array<{ id: number; name?: string }>;
  platforms?: Array<{ id: number; name?: string; abbreviation?: string }>;
  cover?: IgdbImage;
  screenshots?: IgdbImage[];
  videos?: IgdbVideo[];
  involved_companies?: Array<{
    id: number;
    company?: { id: number; name?: string };
    developer?: boolean;
    publisher?: boolean;
  }>;
  themes?: Array<{ id: number; name?: string }>;
  game_modes?: Array<{ id: number; name?: string }>;
  player_perspectives?: Array<{ id: number; name?: string }>;
  similar_games?: number[];
  url?: string;
  websites?: Array<{ id: number; url?: string; category?: number }>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Company (POST /companies)
// ---------------------------------------------------------------------------

export interface IgdbCompany {
  id: number;
  name?: string;
  slug?: string;
  description?: string;
  url?: string;
  country?: number;
  start_date?: number; // Unix timestamp
  logo?: IgdbImage;
  developed?: number[];
  published?: number[];
  websites?: Array<{ id: number; url?: string; category?: number }>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Platform (POST /platforms)
// ---------------------------------------------------------------------------

export interface IgdbPlatform {
  id: number;
  name?: string;
  slug?: string;
  abbreviation?: string;
  summary?: string;
  generation?: number;
  platform_family?: { id: number; name?: string };
  platform_logo?: IgdbImage;
  versions?: Array<{
    id: number;
    name?: string;
    slug?: string;
  }>;
  websites?: Array<{ id: number; url?: string; category?: number }>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Media types
// ---------------------------------------------------------------------------

export interface IgdbImage {
  id: number;
  image_id?: string;
  url?: string;
  width?: number;
  height?: number;
}

export interface IgdbVideo {
  id: number;
  name?: string;
  video_id?: string; // YouTube video ID
}
