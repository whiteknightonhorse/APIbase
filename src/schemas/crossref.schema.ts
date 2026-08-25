import { z, type ZodSchema } from 'zod';

const worksSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('Search query across title, author, and full text (e.g. "quantum computing")'),
    rows: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of results to return (1-20, default 10)'),
  })
  .strip();

const journalLookup = z
  .object({
    issn: z
      .string()
      .min(1)
      .describe('Journal ISSN in NNNN-NNNN format (e.g. 0028-0836 for Nature)'),
  })
  .strip();

const funderSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Search query for funder/grant organization name (e.g. "national science foundation")',
      ),
    rows: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of results to return (1-20, default 10)'),
  })
  .strip();

const memberSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('Search query for publisher/member name (e.g. "elsevier", "springer")'),
    rows: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of results to return (1-20, default 10)'),
  })
  .strip();

export const crossrefSchemas: Record<string, ZodSchema> = {
  'crossref.works_search': worksSearch,
  'crossref.journal_lookup': journalLookup,
  'crossref.funder_search': funderSearch,
  'crossref.member_search': memberSearch,
};
