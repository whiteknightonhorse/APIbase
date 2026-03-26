import { z } from 'zod';

const indicatorsSchema = z.object({
  search: z.string().optional().describe('Keyword to filter indicators by name (e.g. "mortality", "immunization", "life expectancy", "HIV", "malaria")'),
  limit: z.number().int().min(1).max(100).optional().describe('Number of indicators to return, max 100 (default 20)'),
}).strip();

const dataSchema = z.object({
  indicator: z.string().describe('WHO indicator code (e.g. "WHOSIS_000001" for life expectancy, "MDG_0000000001" for under-5 mortality). Get codes from who.indicators'),
  country: z.string().optional().describe('ISO 3166-1 alpha-3 country code (e.g. "USA", "DEU", "BRA", "JPN"). Omit for all countries'),
  year_from: z.number().int().optional().describe('Earliest year to include (e.g. 2000)'),
  year_to: z.number().int().optional().describe('Latest year to include (e.g. 2023)'),
  limit: z.number().int().min(1).max(100).optional().describe('Number of data points to return, max 100 (default 20)'),
}).strip();

const countriesSchema = z.object({
  search: z.string().optional().describe('Partial country name to filter (e.g. "United", "Germany", "Brazil")'),
  limit: z.number().int().min(1).max(200).optional().describe('Number of countries to return, max 200 (default 50)'),
}).strip();

export const whoSchemas: Record<string, z.ZodSchema> = {
  'who.indicators': indicatorsSchema,
  'who.data': dataSchema,
  'who.countries': countriesSchema,
};
