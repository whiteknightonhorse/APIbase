import { z, type ZodSchema } from 'zod';

const speciesSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Species name to search — common name (e.g. "polar bear") or scientific name (e.g. "Ursus maritimus")',
      ),
    rank: z
      .enum(['KINGDOM', 'PHYLUM', 'CLASS', 'ORDER', 'FAMILY', 'GENUS', 'SPECIES'])
      .optional()
      .describe(
        'Taxonomic rank filter (default: SPECIES). Use SPECIES to avoid virus/subspecies matches.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of results (1-20, default 5)'),
  })
  .strip();

const speciesDetails = z
  .object({
    taxon_key: z.number().int().describe('GBIF taxon key (numeric ID from species search results)'),
  })
  .strip();

const occurrences = z
  .object({
    taxon_key: z.number().int().describe('GBIF taxon key for the species to search occurrences'),
    country: z
      .string()
      .length(2)
      .optional()
      .describe('ISO 3166-1 alpha-2 country code (e.g. US, GB, BR, AU)'),
    year: z
      .number()
      .int()
      .min(1700)
      .max(2026)
      .optional()
      .describe('Filter by observation year (e.g. 2024)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results (1-50, default 10)'),
  })
  .strip();

const occurrenceCount = z
  .object({
    taxon_key: z.number().int().describe('GBIF taxon key to count occurrences for'),
    country: z
      .string()
      .length(2)
      .optional()
      .describe('ISO country code to filter count (e.g. US, BR)'),
  })
  .strip();

export const gbifSchemas: Record<string, ZodSchema> = {
  'gbif.species_search': speciesSearch,
  'gbif.species_details': speciesDetails,
  'gbif.occurrences': occurrences,
  'gbif.occurrence_count': occurrenceCount,
};
