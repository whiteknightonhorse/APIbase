/**
 * BallDontLie types (UC-251).
 * Multi-sport data — NBA, NFL, MLB, NHL, Soccer, F1.
 */

export interface BDLTeam {
  id: number;
  conference: string;
  division: string;
  city: string;
  name: string;
  full_name: string;
  abbreviation: string;
}

export interface BDLPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  jersey_number: string;
  team: BDLTeam;
}

export interface BDLGame {
  id: number;
  date: string;
  season: number;
  status: string;
  home_team: BDLTeam;
  home_team_score: number;
  visitor_team: BDLTeam;
  visitor_team_score: number;
}

export interface BDLMeta {
  total_count: number;
  next_cursor: number | null;
  per_page: number;
}

// Normalized outputs

export interface GamesOutput {
  games: Array<{
    id: number;
    date: string;
    status: string;
    home_team: string;
    home_score: number;
    visitor_team: string;
    visitor_score: number;
    season: number;
  }>;
  total: number;
}

export interface TeamsOutput {
  teams: Array<{
    id: number;
    name: string;
    abbreviation: string;
    city: string;
    conference: string;
    division: string;
  }>;
  total: number;
}

export interface PlayersOutput {
  players: Array<{
    id: number;
    name: string;
    position: string;
    jersey: string;
    team: string;
  }>;
  total: number;
}
