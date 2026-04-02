import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    query: z
      .string()
      .describe('Search query (e.g. "Tesla", "Barack Obama", "JavaScript", "Mount Everest")'),
    language: z
      .string()
      .optional()
      .default('en')
      .describe('Language code for labels (e.g. "en", "de", "fr", "ja"). Default: en'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(10)
      .describe('Max results (1-20, default 10)'),
  })
  .strip();

const entity = z
  .object({
    id: z
      .string()
      .describe(
        'Wikidata entity ID (e.g. "Q42" for Douglas Adams, "Q478214" for Tesla Inc). Get IDs from wikidata.search',
      ),
  })
  .strip();

export const wikidataSchemas: Record<string, ZodSchema> = {
  'wikidata.search': search,
  'wikidata.entity': entity,
};
