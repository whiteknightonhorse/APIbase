import { z, type ZodSchema } from 'zod';

const entitySearch = z
  .object({
    name: z
      .string()
      .min(1)
      .describe(
        'Company or organization name to search (e.g. "Lockheed", "Google", "Deloitte"). Supports partial match.',
      ),
    state: z.string().max(2).optional().describe('US state code to filter (e.g. VA, CA, TX)'),
    naics_code: z
      .string()
      .optional()
      .describe('NAICS industry code to filter (e.g. 541512 for Computer Systems Design)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of results (1-25, default 10)'),
  })
  .strip();

const entityDetail = z
  .object({
    uei: z
      .string()
      .min(1)
      .describe(
        'Unique Entity Identifier (UEI) — 12-character SAM.gov ID (e.g. KM99JJBNQ9M5 for Lockheed Martin)',
      ),
  })
  .strip();

export const samSchemas: Record<string, ZodSchema> = {
  'sam.entity_search': entitySearch,
  'sam.entity_detail': entityDetail,
};
