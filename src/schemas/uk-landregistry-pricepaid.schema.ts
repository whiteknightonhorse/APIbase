import { z, type ZodSchema } from 'zod';

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .optional();

const searchByPostcode = z
  .object({
    postcode: z
      .string()
      .min(1)
      .describe('UK postcode to search (e.g. "SW1A 1AA"). Matches on exact postcode.'),
    min_date: dateField.describe(
      'Only include transactions completed on/after this date (YYYY-MM-DD).',
    ),
    max_date: dateField.describe(
      'Only include transactions completed on/before this date (YYYY-MM-DD).',
    ),
    min_price: z.number().nonnegative().optional().describe('Minimum price paid in GBP.'),
    max_price: z.number().nonnegative().optional().describe('Maximum price paid in GBP.'),
    page: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Zero-based page number for pagination (default 0).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of transactions per page (1-100, default 20).'),
  })
  .strip();

const searchByArea = z
  .object({
    town: z
      .string()
      .optional()
      .describe(
        'Town/post town to search (e.g. "WARRINGTON"). At least one of town, county, district is required.',
      ),
    county: z
      .string()
      .optional()
      .describe(
        'County to search (e.g. "GREATER LONDON"). At least one of town, county, district is required.',
      ),
    district: z
      .string()
      .optional()
      .describe(
        'Local authority district to search (e.g. "WARRINGTON"). At least one of town, county, district is required.',
      ),
    min_date: dateField.describe(
      'Only include transactions completed on/after this date (YYYY-MM-DD).',
    ),
    max_date: dateField.describe(
      'Only include transactions completed on/before this date (YYYY-MM-DD).',
    ),
    min_price: z.number().nonnegative().optional().describe('Minimum price paid in GBP.'),
    max_price: z.number().nonnegative().optional().describe('Maximum price paid in GBP.'),
    page: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Zero-based page number for pagination (default 0).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of transactions per page (1-100, default 20).'),
  })
  .strip();

const getTransaction = z
  .object({
    transaction_id: z
      .string()
      .min(1)
      .describe(
        'HM Land Registry transaction GUID (e.g. "702EF0D1-AB60-4A1B-A2A1-C127E1EDE547"). Obtain from search_by_postcode or search_by_area.',
      ),
  })
  .strip();

export const ukLandregistryPricepaidSchemas: Record<string, ZodSchema> = {
  'uk-landregistry-pricepaid.search_by_postcode': searchByPostcode,
  'uk-landregistry-pricepaid.search_by_area': searchByArea,
  'uk-landregistry-pricepaid.get_transaction': getTransaction,
};
