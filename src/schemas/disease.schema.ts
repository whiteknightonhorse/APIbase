import { z } from 'zod';

const covidGlobalSchema = z.object({
  yesterday: z.boolean().optional().describe('Return yesterday\'s data instead of today\'s (default false)'),
  twoDaysAgo: z.boolean().optional().describe('Return data from two days ago for comparison (default false)'),
}).strip();

const covidCountrySchema = z.object({
  country: z.string().describe('Country name, ISO2 code, or ISO3 code (e.g. "United States", "US", "USA", "Germany", "DE")'),
  yesterday: z.boolean().optional().describe('Return yesterday\'s data instead of today\'s (default false)'),
  strict: z.boolean().optional().describe('Use strict name matching instead of fuzzy search (default false)'),
}).strip();

const covidHistorySchema = z.object({
  country: z.string().optional().describe('Country name, ISO2/ISO3 code, or "all" for global aggregate (default "all")'),
  lastdays: z.number().int().min(1).max(1500).optional().describe('Number of most recent days to return (default 30, max ~1500 for full history)'),
}).strip();

const influenzaSchema = z.object({
  source: z.enum(['ilinet', 'usil']).optional().describe('Data source: "ilinet" for ILI network data or "usil" for US ILI summary (default "ilinet")'),
}).strip();

export const diseaseSchemas: Record<string, z.ZodSchema> = {
  'disease.covid_global': covidGlobalSchema,
  'disease.covid_country': covidCountrySchema,
  'disease.covid_history': covidHistorySchema,
  'disease.influenza': influenzaSchema,
};
