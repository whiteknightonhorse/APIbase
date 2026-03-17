/**
 * Jikan (MyAnimeList) API response types (UC-051).
 *
 * API host: api.jikan.moe/v4
 * Auth: None (open access, MIT licensed)
 */

export interface JikanImage {
  jpg?: { image_url?: string; small_image_url?: string; large_image_url?: string };
  webp?: { image_url?: string; small_image_url?: string; large_image_url?: string };
}

export interface JikanAnime {
  mal_id: number;
  url: string;
  images: JikanImage;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  type: string | null;
  source: string | null;
  episodes: number | null;
  status: string | null;
  airing: boolean;
  duration: string | null;
  rating: string | null;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  favorites: number | null;
  synopsis: string | null;
  season: string | null;
  year: number | null;
  genres: Array<{ mal_id: number; name: string }>;
  themes: Array<{ mal_id: number; name: string }>;
  demographics: Array<{ mal_id: number; name: string }>;
  studios: Array<{ mal_id: number; name: string }>;
  [key: string]: unknown;
}

export interface JikanManga {
  mal_id: number;
  url: string;
  images: JikanImage;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  type: string | null;
  chapters: number | null;
  volumes: number | null;
  status: string | null;
  publishing: boolean;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  synopsis: string | null;
  genres: Array<{ mal_id: number; name: string }>;
  themes: Array<{ mal_id: number; name: string }>;
  authors: Array<{ mal_id: number; name: string }>;
  [key: string]: unknown;
}

export interface JikanCharacter {
  character: {
    mal_id: number;
    url: string;
    images: JikanImage;
    name: string;
  };
  role: string;
  voice_actors?: Array<{
    person: { mal_id: number; url: string; name: string; images: JikanImage };
    language: string;
  }>;
}

export interface JikanPagination {
  last_visible_page: number;
  has_next_page: boolean;
  items?: { count: number; total: number; per_page: number };
}

export interface JikanSearchResponse {
  pagination: JikanPagination;
  data: JikanAnime[];
}

export interface JikanDetailResponse {
  data: JikanAnime;
}

export interface JikanMangaDetailResponse {
  data: JikanManga;
}

export interface JikanCharactersResponse {
  data: JikanCharacter[];
}
