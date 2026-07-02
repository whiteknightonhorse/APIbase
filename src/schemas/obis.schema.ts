import { z, type ZodSchema } from 'zod';

const occurrenceSearch = z
  .object({
    scientificname: z
      .string()
      .optional()
      .describe(
        'Scientific name of the marine species to search (e.g. "Abra alba", "Gadus morhua", "Thunnus thynnus"). Supports partial matching.',
      ),
    taxonid: z
      .number()
      .int()
      .optional()
      .describe(
        'WoRMS AphiaID (numeric taxon identifier). Use instead of or alongside scientificname for precise lookups.',
      ),
    lat: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe(
        'Center latitude for geographic search (decimal degrees, -90 to 90). Requires lon and radius.',
      ),
    lon: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe(
        'Center longitude for geographic search (decimal degrees, -180 to 180). Requires lat and radius.',
      ),
    radius: z
      .number()
      .positive()
      .optional()
      .describe(
        'Search radius in kilometers around the lat/lon center point. Requires lat and lon.',
      ),
    minyear: z
      .number()
      .int()
      .min(1600)
      .max(2030)
      .optional()
      .describe('Earliest observation year to include (e.g. 2000). Pairs with maxyear.'),
    maxyear: z
      .number()
      .int()
      .min(1600)
      .max(2030)
      .optional()
      .describe('Latest observation year to include (e.g. 2024). Pairs with minyear.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of occurrence records to return (1-100, default 10).'),
  })
  .strip();

const taxonSearch = z
  .object({
    scientificname: z
      .string()
      .min(2)
      .describe(
        'Scientific name of the marine taxon to look up (e.g. "Tursiops truncatus", "Gadus", "Cetacea"). Returns full WoRMS taxonomy.',
      ),
  })
  .strip();

const checklist = z
  .object({
    scientificname: z
      .string()
      .optional()
      .describe(
        'Scientific name filter — restricts checklist to a taxon and its descendants (e.g. "Mollusca" for all molluscs).',
      ),
    taxonid: z
      .number()
      .int()
      .optional()
      .describe(
        'WoRMS AphiaID to filter checklist by taxon. Alternative to scientificname for precise filtering.',
      ),
    areaid: z
      .number()
      .int()
      .optional()
      .describe(
        'OBIS area ID to restrict checklist to a geographic region. Use area search to find IDs.',
      ),
    marine_only: z
      .boolean()
      .optional()
      .describe(
        'If true (default), restricts results to marine-only species. Set false to include brackish/coastal taxa.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of species in the checklist to return (1-100, default 20).'),
  })
  .strip();

const datasetSearch = z
  .object({
    scientificname: z
      .string()
      .optional()
      .describe(
        'Scientific name to find datasets containing records for that species (e.g. "Balaenoptera musculus").',
      ),
    areaid: z
      .number()
      .int()
      .optional()
      .describe('OBIS area ID to find datasets covering a specific geographic region.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of datasets to return (1-50, default 10).'),
  })
  .strip();

export const obisSchemas: Record<string, ZodSchema> = {
  'obis.occurrence_search': occurrenceSearch,
  'obis.taxon_search': taxonSearch,
  'obis.checklist': checklist,
  'obis.dataset_search': datasetSearch,
};
