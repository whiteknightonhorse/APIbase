/**
 * Chess.com Public Data API response types (UC-417).
 *
 * Base URL: https://api.chess.com
 * Auth: none — public read endpoints, open data, commercial use OK for read endpoints.
 * Rate limit: be polite; include User-Agent on every request or 403 is returned.
 */

// ---------------------------------------------------------------------------
// Player Profile (chesscom.player_profile)
// ---------------------------------------------------------------------------

export interface ChesscomPlayerProfile {
  /** Chess.com player ID */
  player_id: number;
  /** Chess.com internal API URL for this player */
  '@id': string;
  /** URL to the player's profile page */
  url: string;
  /** Lowercased username */
  username: string;
  /** Display name (may include uppercase) */
  name?: string;
  /** Title if any (GM, IM, FM, etc.) */
  title?: string;
  /** URL to country resource */
  country?: string;
  /** Player's location string */
  location?: string;
  /** Epoch timestamp of account creation */
  joined: number;
  /** Epoch timestamp last seen online */
  last_online: number;
  /** Whether player is currently online */
  status: string;
  /** Number of followers */
  followers: number;
  /** Player's league */
  league?: string;
  /** Whether account is verified */
  verified?: boolean;
  /** Avatar URL */
  avatar?: string;
}

// ---------------------------------------------------------------------------
// Player Stats (chesscom.player_stats)
// ---------------------------------------------------------------------------

export interface ChesscomRatingRecord {
  rating: number;
  date: number;
  rd?: number;
}

export interface ChesscomRecord {
  win: number;
  loss: number;
  draw: number;
  time_per_move?: number;
  timeout_percent?: number;
}

export interface ChesscomTimeControlStats {
  last?: ChesscomRatingRecord;
  best?: ChesscomRatingRecord;
  record: ChesscomRecord;
  tournament?: {
    count: number;
    withdraw: number;
    points: number;
    highest_finish: number;
  };
}

export interface ChesscomPuzzleRushStats {
  best?: {
    total_attempts: number;
    score: number;
  };
  daily?: {
    total_attempts: number;
    score: number;
  };
}

export interface ChesscomPlayerStats {
  chess_daily?: ChesscomTimeControlStats;
  chess960_daily?: ChesscomTimeControlStats;
  chess_rapid?: ChesscomTimeControlStats;
  chess_bullet?: ChesscomTimeControlStats;
  chess_blitz?: ChesscomTimeControlStats;
  fide?: number;
  tactics?: {
    highest?: ChesscomRatingRecord;
    lowest?: ChesscomRatingRecord;
  };
  puzzle_rush?: ChesscomPuzzleRushStats;
  lessons?: {
    highest?: ChesscomRatingRecord;
    lowest?: ChesscomRatingRecord;
  };
}

// ---------------------------------------------------------------------------
// Titled Players (chesscom.titled_players)
// ---------------------------------------------------------------------------

export interface ChesscomTitledPlayersResponse {
  players: string[];
}
