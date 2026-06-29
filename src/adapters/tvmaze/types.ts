export interface TvMazeImage {
  medium: string | null;
  original: string | null;
}

export interface TvMazeRating {
  average: number | null;
}

export interface TvMazeCountry {
  name: string;
  code: string;
  timezone: string;
}

export interface TvMazeNetwork {
  id: number;
  name: string;
  country: TvMazeCountry | null;
  officialSite: string | null;
}

export interface TvMazeWebChannel {
  id: number;
  name: string;
  country: TvMazeCountry | null;
  officialSite: string | null;
}

export interface TvMazeSchedule {
  time: string;
  days: string[];
}

export interface TvMazeExternals {
  tvrage: number | null;
  thetvdb: number | null;
  imdb: string | null;
}

export interface TvMazeShow {
  id: number;
  url: string;
  name: string;
  type: string;
  language: string | null;
  genres: string[];
  status: string;
  runtime: number | null;
  averageRuntime: number | null;
  premiered: string | null;
  ended: string | null;
  officialSite: string | null;
  schedule: TvMazeSchedule;
  rating: TvMazeRating;
  weight: number;
  network: TvMazeNetwork | null;
  webChannel: TvMazeWebChannel | null;
  externals: TvMazeExternals;
  image: TvMazeImage | null;
  summary: string | null;
}

export interface TvMazeSearchResult {
  score: number;
  show: TvMazeShow;
}

export interface TvMazeEpisode {
  id: number;
  url: string;
  name: string;
  season: number;
  number: number | null;
  type: string;
  airdate: string;
  airtime: string;
  airstamp: string;
  runtime: number | null;
  rating: TvMazeRating;
  image: TvMazeImage | null;
  summary: string | null;
}

export interface TvMazePerson {
  id: number;
  url: string;
  name: string;
  country: TvMazeCountry | null;
  birthday: string | null;
  deathday: string | null;
  gender: string | null;
  image: TvMazeImage | null;
}

export interface TvMazeCharacter {
  id: number;
  url: string;
  name: string;
  image: TvMazeImage | null;
}

export interface TvMazeCastMember {
  person: TvMazePerson;
  character: TvMazeCharacter;
  self: boolean;
  voice: boolean;
}

export interface TvMazeSeason {
  id: number;
  url: string;
  number: number;
  name: string;
  episodeOrder: number | null;
  premiereDate: string | null;
  endDate: string | null;
  network: TvMazeNetwork | null;
  webChannel: TvMazeWebChannel | null;
  image: TvMazeImage | null;
  summary: string | null;
}

export interface TvMazeScheduleEpisode extends TvMazeEpisode {
  show?: TvMazeShow;
  _embedded?: { show: TvMazeShow };
}
