/**
 * Listen Notes Podcast Search types (UC-225).
 * 3.7M+ podcasts, 186M+ episodes.
 */

export interface LNSearchResult {
  id: string;
  title_original: string;
  description_original: string;
  podcast_title_original: string;
  publisher_original: string;
  audio_length_sec: number;
  pub_date_ms: number;
  listennotes_url: string;
  audio: string;
  podcast: {
    id: string;
    title_original: string;
    listennotes_url: string;
    image: string;
  };
}

export interface LNSearchResponse {
  count: number;
  total: number;
  results: LNSearchResult[];
  next_offset: number;
}

export interface LNPodcast {
  id: string;
  title: string;
  publisher: string;
  description: string;
  image: string;
  language: string;
  country: string;
  website: string;
  total_episodes: number;
  listennotes_url: string;
  explicit_content: boolean;
  latest_pub_date_ms: number;
  earliest_pub_date_ms: number;
  listen_score: number | null;
  listen_score_global_rank: string | null;
  genre_ids: number[];
}

export interface LNBestPodcast {
  id: string;
  title: string;
  publisher: string;
  image: string;
  total_episodes: number;
  listennotes_url: string;
  description: string;
  listen_score: number | null;
}

export interface LNBestResponse {
  id: number;
  name: string;
  total: number;
  has_next: boolean;
  podcasts: LNBestPodcast[];
  parent_id: number;
  page_number: number;
}

// Normalized outputs

export interface SearchOutput {
  results: Array<{
    episode_id: string;
    episode_title: string;
    podcast_title: string;
    publisher: string;
    duration_sec: number;
    published: string;
    audio_url: string;
    listen_url: string;
  }>;
  total: number;
  count: number;
}

export interface PodcastOutput {
  id: string;
  title: string;
  publisher: string;
  description: string;
  language: string;
  country: string;
  website: string;
  total_episodes: number;
  listen_url: string;
  image: string;
  latest_published: string;
  genres: number[];
}

export interface BestOutput {
  genre: string;
  total: number;
  has_next: boolean;
  page: number;
  podcasts: Array<{
    id: string;
    title: string;
    publisher: string;
    total_episodes: number;
    listen_url: string;
    description: string;
  }>;
}
