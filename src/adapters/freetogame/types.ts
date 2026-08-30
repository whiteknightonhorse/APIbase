/**
 * FreeToGame API response types (UC-636).
 *
 * API host: www.freetogame.com/api
 * Auth: none
 * Free tier: unlimited (no documented rate limit)
 */

export interface FreeToGameListItem {
  id: number;
  title: string;
  thumbnail: string;
  short_description: string;
  game_url: string;
  genre: string;
  platform: string;
  publisher: string;
  developer: string;
  release_date: string;
  freetogame_profile_url: string;
}

export type GameListResponse = FreeToGameListItem[];

export interface FreeToGameSystemRequirements {
  os?: string;
  processor?: string;
  memory?: string;
  graphics?: string;
  storage?: string;
}

export interface FreeToGameScreenshot {
  id: number;
  image: string;
}

export interface GameDetailResponse {
  id: number;
  title: string;
  thumbnail: string;
  status: string;
  short_description: string;
  description: string;
  game_url: string;
  genre: string;
  platform: string;
  publisher: string;
  developer: string;
  release_date: string;
  freetogame_profile_url: string;
  minimum_system_requirements?: FreeToGameSystemRequirements;
  screenshots?: FreeToGameScreenshot[];
}

export type FilterResponse = FreeToGameListItem[];
