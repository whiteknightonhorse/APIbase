/**
 * RAWG Video Games Database response types (UC-037).
 *
 * API host: api.rawg.io/api
 * Auth: query param key=KEY
 * Free tier: unlimited (fair use)
 */

// ---------------------------------------------------------------------------
// Common pagination wrapper
// ---------------------------------------------------------------------------

export interface RawgPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ---------------------------------------------------------------------------
// Game Search (/games)
// ---------------------------------------------------------------------------

export interface RawgGameListItem {
  id: number;
  slug: string;
  name: string;
  released?: string;
  background_image?: string;
  rating?: number;
  rating_top?: number;
  ratings_count?: number;
  metacritic?: number;
  playtime?: number;
  genres?: Array<{ id: number; name: string; slug: string }>;
  platforms?: Array<{
    platform: { id: number; name: string; slug: string };
    released_at?: string;
  }>;
  stores?: Array<{
    store: { id: number; name: string; slug: string };
  }>;
  tags?: Array<{ id: number; name: string; slug: string }>;
  esrb_rating?: { id: number; name: string; slug: string } | null;
  short_screenshots?: Array<{ id: number; image: string }>;
}

export type GameSearchResponse = RawgPaginatedResponse<RawgGameListItem>;

// ---------------------------------------------------------------------------
// Game Details (/games/{id})
// ---------------------------------------------------------------------------

export interface GameDetailsResponse {
  id: number;
  slug: string;
  name: string;
  name_original?: string;
  description?: string;
  description_raw?: string;
  released?: string;
  background_image?: string;
  background_image_additional?: string;
  website?: string;
  metacritic?: number;
  metacritic_url?: string;
  rating?: number;
  rating_top?: number;
  ratings?: Array<{ id: number; title: string; count: number; percent: number }>;
  ratings_count?: number;
  reviews_count?: number;
  playtime?: number;
  platforms?: Array<{
    platform: { id: number; name: string; slug: string };
    released_at?: string;
    requirements?: { minimum?: string; recommended?: string };
  }>;
  genres?: Array<{ id: number; name: string; slug: string }>;
  stores?: Array<{
    id: number;
    url?: string;
    store: { id: number; name: string; slug: string };
  }>;
  developers?: Array<{ id: number; name: string; slug: string }>;
  publishers?: Array<{ id: number; name: string; slug: string }>;
  tags?: Array<{ id: number; name: string; slug: string }>;
  esrb_rating?: { id: number; name: string; slug: string } | null;
  added?: number;
  added_by_status?: Record<string, number>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Screenshots (/games/{id}/screenshots)
// ---------------------------------------------------------------------------

export interface ScreenshotItem {
  id: number;
  image: string;
  width?: number;
  height?: number;
  is_deleted?: boolean;
}

export type ScreenshotsResponse = RawgPaginatedResponse<ScreenshotItem>;

// ---------------------------------------------------------------------------
// Store Links (/games/{id}/stores)
// ---------------------------------------------------------------------------

export interface StoreLink {
  id: number;
  game_id?: number;
  store_id?: number;
  url?: string;
}

export type StoreLinksResponse = RawgPaginatedResponse<StoreLink>;

// ---------------------------------------------------------------------------
// Game Series (/games/{id}/game-series)
// ---------------------------------------------------------------------------

export type GameSeriesResponse = RawgPaginatedResponse<RawgGameListItem>;
