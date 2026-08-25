import { z, type ZodSchema } from 'zod';

const oaLookup = z
  .object({
    doi: z
      .string()
      .min(1)
      .describe(
        'DOI of the scholarly work to look up, with or without the "https://doi.org/" prefix (e.g. 10.1038/nature12373)',
      ),
  })
  .strip();

export const unpaywallSchemas: Record<string, ZodSchema> = {
  'unpaywall.oa_lookup': oaLookup,
};
