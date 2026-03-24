import { z, type ZodSchema } from 'zod';

const searchPhotos = z.object({
  query: z.string().min(1).describe('Search term (e.g. "sunset beach", "office meeting", "technology")'),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional().describe('Photo orientation filter'),
  color: z.string().optional().describe('Color filter (e.g. "red", "blue", "green", "yellow", "orange", "white", "black")'),
  size: z.enum(['large', 'medium', 'small']).optional().describe('Minimum photo size'),
  limit: z.number().int().min(1).max(80).optional().describe('Results per page (default 10, max 80)'),
  page: z.number().int().min(1).optional().describe('Page number for pagination'),
}).strip();

const searchVideos = z.object({
  query: z.string().min(1).describe('Search term for videos (e.g. "nature timelapse", "city traffic", "cooking")'),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional().describe('Video orientation'),
  size: z.enum(['large', 'medium', 'small']).optional().describe('Minimum video size'),
  limit: z.number().int().min(1).max(80).optional().describe('Results per page (default 10, max 80)'),
}).strip();

const curated = z.object({
  limit: z.number().int().min(1).max(80).optional().describe('Number of curated photos (default 10, max 80)'),
  page: z.number().int().min(1).optional().describe('Page number'),
}).strip();

export const pexelsSchemas: Record<string, ZodSchema> = {
  'pexels.search_photos': searchPhotos,
  'pexels.search_videos': searchVideos,
  'pexels.curated': curated,
};
