import { z, type ZodSchema } from 'zod';

const musicArtistSearch = z
  .object({
    query: z.string().describe('Search query for artist name (e.g. "Radiohead", "Miles Davis")'),
    limit: z.number().int().min(1).max(100).optional().describe('Max results to return (1-100, default 25)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset for results'),
  })
  .strip();

const musicArtistDetails = z
  .object({
    mbid: z.string().uuid().describe('MusicBrainz artist ID (UUID format, e.g. "a74b1b7f-71a5-4011-9441-d0b5e4122711")'),
  })
  .strip();

const musicReleaseSearch = z
  .object({
    query: z.string().describe('Search query for release/album title (e.g. "OK Computer", "Kind of Blue"). Supports Lucene syntax: artist:"Radiohead" AND release:"OK Computer"'),
    limit: z.number().int().min(1).max(100).optional().describe('Max results to return (1-100, default 25)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset for results'),
  })
  .strip();

const musicReleaseDetails = z
  .object({
    mbid: z.string().uuid().describe('MusicBrainz release ID (UUID format). Returns artist credits and label info'),
  })
  .strip();

const musicRecordingSearch = z
  .object({
    query: z.string().describe('Search query for song/recording title (e.g. "Creep", "So What"). Supports Lucene syntax: artist:"Radiohead" AND recording:"Creep"'),
    limit: z.number().int().min(1).max(100).optional().describe('Max results to return (1-100, default 25)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset for results'),
  })
  .strip();

const musicFreshReleases = z
  .object({
    days: z.number().int().min(1).max(90).optional().describe('Number of days to look back for fresh releases (1-90, default 7)'),
    limit: z.number().int().min(1).max(200).optional().describe('Max releases to return (1-200, default 50)'),
  })
  .strip();

const musicRadioSearch = z
  .object({
    name: z.string().optional().describe('Station name to search for (e.g. "BBC Radio", "Jazz FM")'),
    tag: z.string().optional().describe('Tag/genre filter (e.g. "rock", "jazz", "classical", "news")'),
    country: z.string().optional().describe('Country name filter (e.g. "Germany", "United States")'),
    countrycode: z.string().optional().describe('ISO 3166-1 alpha-2 country code (e.g. "US", "DE", "GB")'),
    language: z.string().optional().describe('Language filter (e.g. "english", "german", "spanish")'),
    limit: z.number().int().min(1).max(100).optional().describe('Max stations to return (1-100, default 25)'),
    order: z.enum(['name', 'url', 'homepage', 'favicon', 'tags', 'country', 'state', 'language', 'votes', 'codec', 'bitrate', 'lastcheckok', 'lastchecktime', 'clicktimestamp', 'clickcount', 'clicktrend', 'changetimestamp', 'random']).optional().describe('Sort order for results'),
    hidebroken: z.boolean().optional().describe('Hide broken/offline stations (recommended: true)'),
  })
  .strip();

export const musicSchemas: Record<string, ZodSchema> = {
  'music.artist_search': musicArtistSearch,
  'music.artist_details': musicArtistDetails,
  'music.release_search': musicReleaseSearch,
  'music.release_details': musicReleaseDetails,
  'music.recording_search': musicRecordingSearch,
  'music.fresh_releases': musicFreshReleases,
  'music.radio_search': musicRadioSearch,
};
