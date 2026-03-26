import { z } from 'zod';

const latestSchema = z.object({
  language: z.string().optional().describe('ISO 639-1 language code (e.g. "en", "de", "fr", "ja", "zh"). Default: all languages'),
  country: z.string().optional().describe('ISO 3166-1 alpha-2 country code (e.g. "US", "GB", "DE", "JP")'),
  category: z.string().optional().describe('News category filter (e.g. "technology", "business", "health", "sports", "science", "entertainment", "finance", "world")'),
  page_size: z.number().int().min(1).max(200).optional().describe('Number of articles to return, max 200 (default 10)'),
}).strip();

const searchSchema = z.object({
  keywords: z.string().describe('Search keywords — supports Boolean operators (e.g. "AI agents", "climate AND policy")'),
  language: z.string().optional().describe('ISO 639-1 language code (e.g. "en", "es", "ar")'),
  country: z.string().optional().describe('ISO 3166-1 alpha-2 country code'),
  start_date: z.string().optional().describe('Start date in ISO 8601 format (e.g. "2026-03-01T00:00:00+00:00")'),
  end_date: z.string().optional().describe('End date in ISO 8601 format'),
  page_size: z.number().int().min(1).max(200).optional().describe('Number of articles to return, max 200 (default 10)'),
}).strip();

const categoriesSchema = z.object({
  locale: z.string().optional().describe('Response locale (default: en)'),
}).strip();

export const currentsSchemas: Record<string, z.ZodSchema> = {
  'currents.latest': latestSchema,
  'currents.search': searchSchema,
  'currents.categories': categoriesSchema,
};
