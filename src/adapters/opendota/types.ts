/**
 * OpenDota API response types (UC-418).
 *
 * OpenDota — Dota 2 statistics API (https://docs.opendota.com/)
 * Base URL: https://api.opendota.com/api
 * Auth: api_key query parameter.
 * License: open data, commercial use OK.
 *
 * Upstream cost: $0.0001/call (billed monthly).
 */

// ---------------------------------------------------------------------------
// Player summary (GET /players/{account_id})
// ---------------------------------------------------------------------------

export interface OpenDotaPlayerProfile {
  account_id: number;
  personaname: string;
  name: string | null;
  plus: boolean;
  cheese: number;
  steamid: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  profileurl: string;
  last_login: string | null;
  loccountrycode: string | null;
  status: string | null;
  fh_unavailable: boolean;
  is_contributor: boolean;
  is_subscriber: boolean;
}

export interface OpenDotaPlayerSummaryResponse {
  profile: OpenDotaPlayerProfile;
  rank_tier: number | null;
  leaderboard_rank: number | null;
  mmr_estimate?: {
    estimate: number;
    stddev: number | null;
    n: number | null;
  };
  // Private profiles return {} — propagate as-is.
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Player matches (GET /players/{account_id}/matches)
// ---------------------------------------------------------------------------

export interface OpenDotaPlayerMatch {
  match_id: number;
  player_slot: number;
  radiant_win: boolean;
  duration: number;
  game_mode: number;
  lobby_type: number;
  hero_id: number;
  start_time: number;
  version: number | null;
  kills: number;
  deaths: number;
  assists: number;
  skill: number | null;
  average_rank: number | null;
  xp_per_min: number;
  gold_per_min: number;
  hero_damage: number;
  tower_damage: number;
  hero_healing: number;
  last_hits: number;
  lane: number | null;
  lane_role: number | null;
  is_roaming: boolean | null;
  cluster: number;
  leaver_status: number;
  party_size: number | null;
}

export type OpenDotaPlayerMatchesResponse = OpenDotaPlayerMatch[];

// ---------------------------------------------------------------------------
// Match detail (GET /matches/{match_id})
// ---------------------------------------------------------------------------

export interface OpenDotaMatchPlayer {
  account_id: number | null;
  player_slot: number;
  hero_id: number;
  kills: number;
  deaths: number;
  assists: number;
  last_hits: number;
  denies: number;
  gold_per_min: number;
  xp_per_min: number;
  hero_damage: number;
  tower_damage: number;
  hero_healing: number;
  level: number;
  net_worth: number;
  item_0: number;
  item_1: number;
  item_2: number;
  item_3: number;
  item_4: number;
  item_5: number;
  personaname: string | null;
  radiant_win: boolean;
  [key: string]: unknown;
}

export interface OpenDotaMatchDetailResponse {
  match_id: number;
  barracks_status_dire: number;
  barracks_status_radiant: number;
  chat: unknown[];
  cluster: number;
  dire_score: number;
  duration: number;
  engine: number;
  first_blood_time: number;
  game_mode: number;
  human_players: number;
  leagueid: number;
  lobby_type: number;
  match_seq_num: number;
  negative_votes: number;
  objectives: unknown[];
  picks_bans: unknown[] | null;
  positive_votes: number;
  radiant_gold_adv: number[] | null;
  radiant_score: number;
  radiant_win: boolean;
  radiant_xp_adv: number[] | null;
  skill: number | null;
  start_time: number;
  teamfights: unknown[] | null;
  tower_status_dire: number;
  tower_status_radiant: number;
  version: number | null;
  replay_salt: number;
  series_id: number;
  series_type: number;
  players: OpenDotaMatchPlayer[];
  patch: number;
  region: number;
  comeback: number;
  throw: number;
  loss: number;
  win: number;
  replay_url: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Pro teams (GET /teams)
// ---------------------------------------------------------------------------

export interface OpenDotaProTeam {
  team_id: number;
  rating: number;
  wins: number;
  losses: number;
  last_match_time: number;
  name: string;
  tag: string;
  logo_url: string | null;
  [key: string]: unknown;
}

export type OpenDotaProTeamsResponse = OpenDotaProTeam[];
