/**
 * AudD Music Recognition types (UC-226).
 * Audio fingerprinting — identifies songs from audio URLs.
 */

export interface AuddRecognizeResult {
  artist: string;
  title: string;
  album: string;
  release_date: string;
  label: string;
  timecode: string;
  song_link: string;
  spotify?: {
    external_urls: { spotify: string };
    album: { name: string; images: Array<{ url: string }> };
    artists: Array<{ name: string }>;
    preview_url: string | null;
  };
  apple_music?: {
    url: string;
    albumName: string;
    artistName: string;
    artwork: { url: string };
    previews: Array<{ url: string }>;
  };
}

export interface AuddLyricsResult {
  song_id: number;
  artist_id: number;
  title: string;
  artist: string;
  lyrics: string;
  full_title: string;
  song_art_image_url: string;
  media: Array<{ provider: string; url: string }>;
}

export interface AuddApiResponse {
  status: string;
  result: unknown;
}

// Normalized outputs

export interface RecognizeOutput {
  artist: string;
  title: string;
  album: string;
  release_date: string;
  label: string;
  spotify_url: string | null;
  apple_music_url: string | null;
  song_link: string | null;
  matched: boolean;
}

export interface LyricsOutput {
  results: Array<{
    artist: string;
    title: string;
    lyrics: string;
    full_title: string;
  }>;
  count: number;
}
