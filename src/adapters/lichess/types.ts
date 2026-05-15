/**
 * Lichess API response types (UC-416).
 *
 * Base URL: https://lichess.org
 * Auth: none — public read endpoints, open API, commercial use OK.
 */

// ---------------------------------------------------------------------------
// User Profile (lichess.user_profile)
// ---------------------------------------------------------------------------

export interface LichessPerf {
  games: number;
  rating: number;
  rd: number;
  prog: number;
  prov?: boolean;
}

export interface LichessUserProfile {
  id: string;
  username: string;
  online?: boolean;
  perfs?: {
    bullet?: LichessPerf;
    blitz?: LichessPerf;
    rapid?: LichessPerf;
    classical?: LichessPerf;
    correspondence?: LichessPerf;
    puzzle?: LichessPerf;
    ultraBullet?: LichessPerf;
    chess960?: LichessPerf;
    crazyhouse?: LichessPerf;
    antichess?: LichessPerf;
    atomic?: LichessPerf;
    horde?: LichessPerf;
    kingOfTheHill?: LichessPerf;
    racingKings?: LichessPerf;
    threeCheck?: LichessPerf;
  };
  createdAt?: number;
  seenAt?: number;
  playTime?: {
    total: number;
    tv: number;
  };
  url?: string;
  count?: {
    all: number;
    rated: number;
    ai: number;
    draw: number;
    drawH: number;
    loss: number;
    lossH: number;
    win: number;
    winH: number;
    bookmark: number;
    playing: number;
    import: number;
    me: number;
  };
  followable?: boolean;
  following?: boolean;
  blocking?: boolean;
  followsYou?: boolean;
  profile?: {
    country?: string;
    location?: string;
    bio?: string;
    firstName?: string;
    lastName?: string;
    fideRating?: number;
    uscfRating?: number;
    ecfRating?: number;
    links?: string;
  };
}

// ---------------------------------------------------------------------------
// Top Players (lichess.top_players)
// ---------------------------------------------------------------------------

export interface LichessTopPlayer {
  id: string;
  username: string;
  perfs?: {
    [key: string]: LichessPerf;
  };
  title?: string;
  online?: boolean;
  patron?: boolean;
}

export interface LichessTopPlayersResponse {
  users: LichessTopPlayer[];
}

// ---------------------------------------------------------------------------
// Daily Puzzle (lichess.daily_puzzle)
// ---------------------------------------------------------------------------

export interface LichessPuzzleGame {
  id: string;
  perf: { key: string; name: string };
  rated: boolean;
  players: { name: string; id?: string; color: string; rating?: number }[];
  pgn: string;
  clock?: string;
}

export interface LichessPuzzle {
  id: string;
  rating: number;
  plays: number;
  solution: string[];
  themes: string[];
  initialPly: number;
  game: LichessPuzzleGame;
  url: string;
}

export interface LichessDailyPuzzleResponse {
  game: LichessPuzzleGame;
  puzzle: LichessPuzzle;
}
