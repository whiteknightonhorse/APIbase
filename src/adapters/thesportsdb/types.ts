export interface TheSportsDbTeam {
  idTeam: string;
  strTeam: string;
  strTeamShort: string | null;
  strTeamAlternate: string | null;
  intFormedYear: string | null;
  strSport: string;
  strLeague: string | null;
  idLeague: string | null;
  strStadium: string | null;
  strLocation: string | null;
  strCountry: string | null;
  strWebsite: string | null;
  strDescriptionEN: string | null;
  strBadge: string | null;
  strBanner: string | null;
  strFanart1: string | null;
}

export interface TheSportsDbPlayer {
  idPlayer: string;
  idTeam: string | null;
  strPlayer: string;
  strTeam: string | null;
  strSport: string | null;
  strNationality: string | null;
  dateBorn: string | null;
  strStatus: string | null;
  strGender: string | null;
  strPosition: string | null;
  strThumb: string | null;
  strCutout: string | null;
  relevance?: string;
}

export interface TheSportsDbEvent {
  idEvent: string;
  strEvent: string;
  strSport: string;
  idLeague: string;
  strLeague: string;
  strSeason: string | null;
  strHomeTeam: string | null;
  strAwayTeam: string | null;
  idHomeTeam: string | null;
  idAwayTeam: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  intRound: string | null;
  dateEvent: string | null;
  strTime: string | null;
  strTimestamp: string | null;
  strStatus: string | null;
  strVenue: string | null;
  strCountry: string | null;
  strResult: string | null;
  strHomeTeamBadge: string | null;
  strAwayTeamBadge: string | null;
}

export interface TheSportsDbTeamsResponse {
  teams: TheSportsDbTeam[] | null;
}

export interface TheSportsDbPlayersResponse {
  player: TheSportsDbPlayer[] | null;
}

export interface TheSportsDbEventsResponse {
  events: TheSportsDbEvent[] | null;
}
