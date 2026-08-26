import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// nsf-awards.search — search NSF-funded research awards
// ---------------------------------------------------------------------------

const nsfAwardsSearch = z
  .object({
    keyword: z
      .string()
      .optional()
      .describe(
        'Full-text search term matched against award title/abstract (e.g. "climate", "quantum computing").',
      ),
    awardeeName: z
      .string()
      .optional()
      .describe('Filter by recipient institution name substring (e.g. "Stanford", "MIT").'),
    awardeeStateCode: z
      .string()
      .length(2)
      .optional()
      .describe('Filter by recipient institution US state code, 2 letters (e.g. "CA", "NY").'),
    cfdaNumber: z
      .string()
      .optional()
      .describe(
        'Filter by CFDA program number (e.g. "47.070" for Computer and Information Science).',
      ),
    dateStart: z
      .string()
      .optional()
      .describe('Only awards made on/after this date, format MM/DD/YYYY.'),
    dateEnd: z
      .string()
      .optional()
      .describe('Only awards made on/before this date, format MM/DD/YYYY.'),
    rpp: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Results per page, 1-25 (default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// nsf-awards.award_detail — get a single award by NSF award ID
// ---------------------------------------------------------------------------

const nsfAwardsAwardDetail = z
  .object({
    id: z
      .string()
      .min(1)
      .describe('NSF award ID, e.g. "2617572". Obtained from nsf-awards.search results.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const nsfAwardsSchemas: Record<string, ZodSchema> = {
  'nsf-awards.search': nsfAwardsSearch,
  'nsf-awards.award_detail': nsfAwardsAwardDetail,
};
