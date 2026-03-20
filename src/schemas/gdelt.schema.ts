import { z, type ZodSchema } from 'zod';

const search = z.object({
  query: z.string().min(3).describe('Search query — keywords, phrases, or boolean (e.g. "climate change", "AI regulation"). Min 3 chars.'),
  limit: z.number().int().min(1).max(75).optional().describe('Number of articles (default 10, max 75)'),
  timespan: z.string().optional().describe('Time window: "15min", "1h", "4h", "1d", "7d", "30d", "3m" (default: all recent)'),
  sort: z.enum(['DateDesc', 'DateAsc', 'ToneDesc', 'ToneAsc', 'HybridRel']).optional().describe('Sort order: DateDesc (newest), ToneDesc (most positive), HybridRel (relevance)'),
  language: z.string().optional().describe('Source language filter (e.g. "english", "spanish", "chinese")'),
}).strip();

const timeline = z.object({
  query: z.string().min(3).describe('Query to track mention volume over time (e.g. "Bitcoin", "artificial intelligence")'),
  timespan: z.string().optional().describe('Time window: "1d", "7d", "30d", "3m" (default: 3 months)'),
}).strip();

export const gdeltSchemas: Record<string, ZodSchema> = {
  'gdelt.search': search,
  'gdelt.timeline': timeline,
};
