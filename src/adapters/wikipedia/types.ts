/**
 * Wikipedia REST API response types (UC-523).
 *
 * Base URL: https://en.wikipedia.org/api/rest_v1  (page summary, media, feed)
 *           https://en.wikipedia.org/w/rest.php/v1 (search)
 * Auth: None (CC BY-SA 4.0 — attribution required in production)
 */

// ---------------------------------------------------------------------------
// Shared thumbnail shape
// ---------------------------------------------------------------------------

export interface WikiThumbnail {
  source?: string;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Page Summary (/api/rest_v1/page/summary/{title})
// ---------------------------------------------------------------------------

export interface WikiSummaryResponse {
  type?: string;
  title?: string;
  displaytitle?: string;
  pageid?: number;
  wikibase_item?: string;
  lang?: string;
  dir?: string;
  revision?: string;
  tid?: string;
  timestamp?: string;
  description?: string;
  description_source?: string;
  extract?: string;
  extract_html?: string;
  thumbnail?: WikiThumbnail;
  originalimage?: WikiThumbnail;
  coordinates?: { lat?: number; lon?: number };
  content_urls?: {
    desktop?: { page?: string; revisions?: string; edit?: string; talk?: string };
    mobile?: { page?: string; revisions?: string; edit?: string; talk?: string };
  };
  titles?: {
    canonical?: string;
    normalized?: string;
    display?: string;
  };
}

// ---------------------------------------------------------------------------
// Search (/w/rest.php/v1/search/page)
// ---------------------------------------------------------------------------

export interface WikiSearchPage {
  id?: number;
  key?: string;
  title?: string;
  excerpt?: string;
  matched_title?: string | null;
  anchor?: string | null;
  description?: string | null;
  thumbnail?: WikiThumbnail | null;
}

export interface WikiSearchResponse {
  pages: WikiSearchPage[];
}

// ---------------------------------------------------------------------------
// Media List (/api/rest_v1/page/media-list/{title})
// ---------------------------------------------------------------------------

export interface WikiMediaItem {
  title?: string;
  leadImage?: boolean;
  section_id?: number;
  type?: string;
  showInGallery?: boolean;
  srcset?: Array<{ src?: string; scale?: string }>;
  caption?: { html?: string; text?: string };
}

export interface WikiMediaListResponse {
  revision?: string;
  tid?: string;
  items: WikiMediaItem[];
}

// ---------------------------------------------------------------------------
// Feed Featured (/api/rest_v1/feed/featured/{year}/{mm}/{dd})
// ---------------------------------------------------------------------------

export interface WikiFeedArticle {
  type?: string;
  title?: string;
  displaytitle?: string;
  pageid?: number;
  description?: string;
  extract?: string;
  thumbnail?: WikiThumbnail;
  content_urls?: {
    desktop?: { page?: string };
    mobile?: { page?: string };
  };
}

export interface WikiFeedMostRead {
  date?: string;
  articles?: Array<WikiFeedArticle & { rank?: number; views?: number; view_history?: unknown[] }>;
}

export interface WikiFeedImage {
  title?: string;
  thumbnail?: WikiThumbnail;
  image?: { source?: string; width?: number; height?: number };
  file_page?: string;
  artist?: { html?: string; text?: string };
  credit?: { html?: string; text?: string };
  license?: { type?: string; url?: string };
  description?: { html?: string; text?: string; lang?: string };
}

export interface WikiFeedFeaturedResponse {
  tfa?: WikiFeedArticle;
  mostread?: WikiFeedMostRead;
  image?: WikiFeedImage;
  news?: Array<{ story?: string; links?: WikiFeedArticle[] }>;
  onthisday?: Array<{ text?: string; year?: number; pages?: WikiFeedArticle[] }>;
}

// ---------------------------------------------------------------------------
// On This Day (/api/rest_v1/feed/onthisday/events/{mm}/{dd})
// ---------------------------------------------------------------------------

export interface WikiOnThisDayEvent {
  text?: string;
  year?: number;
  pages?: WikiFeedArticle[];
}

export interface WikiOnThisDayResponse {
  events: WikiOnThisDayEvent[];
}
