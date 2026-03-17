import { z, type ZodSchema } from 'zod';

const animeSearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe('Search query for anime title (e.g. "Naruto", "Attack on Titan")'),
    type: z
      .enum(['tv', 'movie', 'ova', 'special', 'ona', 'music', 'cm', 'pv', 'tv_special'])
      .optional()
      .describe('Anime type filter: tv, movie, ova, special, ona, music'),
    status: z
      .enum(['airing', 'complete', 'upcoming'])
      .optional()
      .describe('Airing status: "airing", "complete", or "upcoming"'),
    rating: z
      .enum(['g', 'pg', 'pg13', 'r17', 'r', 'rx'])
      .optional()
      .describe('Age rating: g (all ages), pg, pg13, r17 (violence), r (mild nudity), rx (hentai)'),
    genre: z
      .number()
      .int()
      .optional()
      .describe('Genre ID filter (e.g. 1=Action, 2=Adventure, 4=Comedy, 8=Drama, 10=Fantasy, 22=Romance)'),
    order_by: z
      .enum(['title', 'start_date', 'end_date', 'episodes', 'score', 'rank', 'popularity', 'favorites', 'members'])
      .optional()
      .describe('Sort field (default: relevance)'),
    sort: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort direction: "asc" or "desc" (default: desc)'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default: 1)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Results per page (default: 10, max: 25)'),
  })
  .strip();

const animeDetails = z
  .object({
    id: z
      .number()
      .int()
      .describe('MyAnimeList ID of the anime (e.g. 1 for Cowboy Bebop, 20 for Naruto)'),
  })
  .strip();

const mangaDetails = z
  .object({
    id: z
      .number()
      .int()
      .describe('MyAnimeList ID of the manga (e.g. 13 for One Piece, 2 for Berserk)'),
  })
  .strip();

const animeCharacters = z
  .object({
    id: z
      .number()
      .int()
      .describe('MyAnimeList ID of the anime to get character cast for'),
  })
  .strip();

const animeTop = z
  .object({
    type: z
      .enum(['tv', 'movie', 'ova', 'special', 'ona', 'music', 'cm', 'pv', 'tv_special'])
      .optional()
      .describe('Filter top list by anime type (default: all types)'),
    filter: z
      .enum(['airing', 'upcoming', 'bypopularity', 'favorite'])
      .optional()
      .describe('Filter: "airing" (currently), "upcoming", "bypopularity", or "favorite"'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number (default: 1)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Results per page (default: 10, max: 25)'),
  })
  .strip();

export const jikanSchemas: Record<string, ZodSchema> = {
  'anime.search': animeSearch,
  'anime.details': animeDetails,
  'manga.details': mangaDetails,
  'anime.characters': animeCharacters,
  'anime.top': animeTop,
};
