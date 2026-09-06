import { z, type ZodSchema } from 'zod';

const searchScientificName = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Scientific name or partial name to search (e.g. "Puma concolor", "Bison bison", or genus only "Ursus").',
      ),
  })
  .strip();

const searchCommonName = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Common (vernacular) name or partial name to search (e.g. "cougar", "grizzly bear").',
      ),
  })
  .strip();

const getFullRecord = z
  .object({
    tsn: z
      .string()
      .min(1)
      .describe(
        'Taxonomic Serial Number (TSN) — ITIS\'s unique numeric identifier for a taxon, e.g. "180543" for Ursus arctos. Obtain a TSN from itistaxonomy.search_scientific_name or itistaxonomy.search_common_name.',
      ),
  })
  .strip();

export const itistaxonomySchemas: Record<string, ZodSchema> = {
  'itistaxonomy.search_scientific_name': searchScientificName,
  'itistaxonomy.search_common_name': searchCommonName,
  'itistaxonomy.get_full_record': getFullRecord,
};
