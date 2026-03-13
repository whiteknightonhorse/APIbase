import { z, type ZodSchema } from 'zod';

const tmdbMovieSearch = z
  .object({
    query: z.string().describe('Search query (movie, TV show, or person name)'),
    language: z.string().optional().describe('ISO 639-1 language code (e.g. "en-US", "de-DE", "ja-JP"). Default: en-US'),
    page: z.number().int().min(1).max(500).optional().describe('Page number (1-500, default 1)'),
    include_adult: z.boolean().optional().describe('Include adult content in results (default false)'),
  })
  .strip();

const tmdbMovieDetails = z
  .object({
    id: z.number().int().describe('TMDB movie ID (e.g. 550 for Fight Club, 27205 for Inception)'),
    language: z.string().optional().describe('ISO 639-1 language code (e.g. "en-US"). Default: en-US'),
  })
  .strip();

const tmdbMovieDiscover = z
  .object({
    type: z.enum(['movie', 'tv']).optional().describe('Content type to discover: "movie" or "tv" (default "movie")'),
    language: z.string().optional().describe('ISO 639-1 language code (e.g. "en-US"). Default: en-US'),
    page: z.number().int().min(1).max(500).optional().describe('Page number (1-500, default 1)'),
    sort_by: z.string().optional().describe('Sort field (e.g. "popularity.desc", "vote_average.desc", "revenue.desc", "primary_release_date.desc")'),
    with_genres: z.string().optional().describe('Comma-separated genre IDs to filter (e.g. "28,12" for Action+Adventure)'),
    year: z.number().int().optional().describe('Filter by release year (movies only)'),
    primary_release_year: z.number().int().optional().describe('Filter by primary release year (movies only)'),
    first_air_date_year: z.number().int().optional().describe('Filter by first air date year (TV only)'),
    vote_average_gte: z.number().min(0).max(10).optional().describe('Minimum vote average (0-10)'),
    vote_average_lte: z.number().min(0).max(10).optional().describe('Maximum vote average (0-10)'),
    with_original_language: z.string().optional().describe('ISO 639-1 original language filter (e.g. "en", "ko", "ja")'),
    region: z.string().optional().describe('ISO 3166-1 region for release dates (e.g. "US", "GB")'),
    include_adult: z.boolean().optional().describe('Include adult content (default false)'),
  })
  .strip();

const tmdbMovieTrending = z
  .object({
    type: z.enum(['movie', 'tv', 'person', 'all']).optional().describe('Content type: "movie", "tv", "person", or "all" (default "movie")'),
    window: z.enum(['day', 'week']).optional().describe('Time window: "day" or "week" (default "week")'),
    language: z.string().optional().describe('ISO 639-1 language code (e.g. "en-US"). Default: en-US'),
    page: z.number().int().min(1).max(500).optional().describe('Page number (1-500, default 1)'),
  })
  .strip();

const tmdbMovieSimilar = z
  .object({
    id: z.number().int().describe('TMDB movie ID to get recommendations for'),
    language: z.string().optional().describe('ISO 639-1 language code (e.g. "en-US"). Default: en-US'),
    page: z.number().int().min(1).max(500).optional().describe('Page number (1-500, default 1)'),
  })
  .strip();

const tmdbMoviePerson = z
  .object({
    query: z.string().optional().describe('Person name to search for (e.g. "Tom Hanks", "Miyazaki"). Use either query or id'),
    id: z.number().int().optional().describe('TMDB person ID for detailed filmography (e.g. 31 for Tom Hanks). Use either id or query'),
    language: z.string().optional().describe('ISO 639-1 language code (e.g. "en-US"). Default: en-US'),
    page: z.number().int().min(1).max(500).optional().describe('Page number for search results (1-500, default 1)'),
    include_adult: z.boolean().optional().describe('Include adult content (default false)'),
  })
  .strip();

const tmdbMovieWhereToWatch = z
  .object({
    id: z.number().int().describe('TMDB movie or TV show ID'),
    type: z.enum(['movie', 'tv']).optional().describe('Content type: "movie" or "tv" (default "movie")'),
  })
  .strip();

export const tmdbSchemas: Record<string, ZodSchema> = {
  'tmdb.movie_search': tmdbMovieSearch,
  'tmdb.movie_details': tmdbMovieDetails,
  'tmdb.movie_discover': tmdbMovieDiscover,
  'tmdb.movie_trending': tmdbMovieTrending,
  'tmdb.movie_similar': tmdbMovieSimilar,
  'tmdb.movie_person': tmdbMoviePerson,
  'tmdb.movie_where_to_watch': tmdbMovieWhereToWatch,
};
