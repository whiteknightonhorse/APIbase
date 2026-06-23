import { z, type ZodSchema } from 'zod';

const speciesSearch = z
  .object({
    name: z
      .string()
      .describe(
        'Scientific or partial name to search (e.g. "Orcinus orca", "Tursiops", "Gadus morhua"). Case-insensitive.',
      ),
    like: z
      .boolean()
      .optional()
      .describe(
        'Enable fuzzy/partial match (default true). Set false for exact scientific name match only.',
      ),
    marine_only: z
      .boolean()
      .optional()
      .describe(
        'Restrict results to marine species only (default true). Set false to include brackish/freshwater/terrestrial.',
      ),
    offset: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Pagination offset — return records starting at this position (default 1, max 50 per page).',
      ),
  })
  .strip();

const speciesDetails = z
  .object({
    aphia_id: z
      .number()
      .int()
      .positive()
      .describe(
        'WoRMS AphiaID — the unique numeric identifier for a taxon (e.g. 137102 for Orcinus orca). Obtain via worms.species.search.',
      ),
  })
  .strip();

const speciesClassification = z
  .object({
    aphia_id: z
      .number()
      .int()
      .positive()
      .describe(
        'WoRMS AphiaID of the taxon whose full classification tree you want to retrieve (e.g. 137102 for Orcinus orca).',
      ),
  })
  .strip();

const speciesVernaculars = z
  .object({
    aphia_id: z
      .number()
      .int()
      .positive()
      .describe(
        'WoRMS AphiaID of the taxon whose vernacular (common) names you want — returns names across all registered languages (e.g. "killer whale" in English, "orca" in Spanish).',
      ),
  })
  .strip();

export const wormsSchemas: Record<string, ZodSchema> = {
  'worms.species.search': speciesSearch,
  'worms.species.details': speciesDetails,
  'worms.species.classification': speciesClassification,
  'worms.species.vernaculars': speciesVernaculars,
};
