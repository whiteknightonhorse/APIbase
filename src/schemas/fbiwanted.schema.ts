import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    title: z
      .string()
      .optional()
      .describe('Filter by name/title, partial case-insensitive match (e.g. "smith").'),
    field_office: z
      .string()
      .optional()
      .describe(
        'Filter by FBI field office slug handling the case (e.g. "seattle", "miami", "losangeles").',
      ),
    sex: z.enum(['male', 'female']).optional().describe('Filter by sex (lowercase values only).'),
    race: z
      .string()
      .optional()
      .describe(
        'Filter by race, lowercase (e.g. "white", "black", "hispanic", "asian", "native").',
      ),
    person_classification: z
      .string()
      .optional()
      .describe('Filter by classification, e.g. "Main" (the wanted subject) or "Victim".'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Results per page (default 20, max 50).'),
  })
  .strip();

const byCategory = z
  .object({
    category: z
      .enum([
        'ten',
        'fraudster',
        'kidnapping',
        'missing',
        'information',
        'ecap',
        'law-enforcement-assistance',
        'default',
      ])
      .describe(
        'Poster category: "ten" (Ten Most Wanted Fugitives), "fraudster" (Most Wanted Fraudsters), ' +
          '"kidnapping", "missing" (missing persons), "information" (seeking information), ' +
          '"ecap" (Endangered Child Alert Program), "law-enforcement-assistance", or "default" (general wanted).',
      ),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Results per page (default 20, max 50).'),
  })
  .strip();

const recent = z
  .object({
    field_office: z
      .string()
      .optional()
      .describe(
        'Restrict to a specific FBI field office slug (e.g. "seattle", "miami", "losangeles").',
      ),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of most recently published entries to return (default 20, max 50).'),
  })
  .strip();

export const fbiwantedSchemas: Record<string, ZodSchema> = {
  'fbiwanted.search': search,
  'fbiwanted.by_category': byCategory,
  'fbiwanted.recent': recent,
};
