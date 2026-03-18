import { z, type ZodSchema } from 'zod';

const forSale = z
  .object({
    city: z
      .string()
      .optional()
      .describe('City name, e.g. "Austin" (use with state_code)'),
    state_code: z
      .string()
      .max(2)
      .optional()
      .describe('Two-letter US state code, e.g. "TX"'),
    postal_code: z
      .string()
      .optional()
      .describe('ZIP code, e.g. "78701" (alternative to city+state)'),
    price_min: z
      .number()
      .int()
      .optional()
      .describe('Minimum listing price in USD'),
    price_max: z
      .number()
      .int()
      .optional()
      .describe('Maximum listing price in USD'),
    beds_min: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Minimum number of bedrooms'),
    baths_min: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Minimum number of bathrooms'),
    sqft_min: z
      .number()
      .int()
      .optional()
      .describe('Minimum square footage'),
    property_type: z
      .enum(['single_family', 'multi_family', 'condo', 'townhomes', 'mobile', 'land', 'farm'])
      .optional()
      .describe('Property type filter'),
    sort: z
      .enum(['relevant', 'newest', 'price_low', 'price_high', 'open_house_date', 'sqft_high', 'price_reduced_date'])
      .optional()
      .describe('Sort order (default: relevant)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(42)
      .optional()
      .describe('Number of results (default 10, max 42)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset (default 0)'),
  })
  .strip();

const propertyDetail = z
  .object({
    property_id: z
      .string()
      .describe('Property ID from a for_sale search result (e.g. "2734304997")'),
  })
  .strip();

const locationSuggest = z
  .object({
    query: z
      .string()
      .min(2)
      .describe('Location search query — city name, address, or ZIP code (e.g. "Austin TX", "90210")'),
  })
  .strip();

export const usrealestateSchemas: Record<string, ZodSchema> = {
  'usrealestate.for_sale': forSale,
  'usrealestate.property_detail': propertyDetail,
  'usrealestate.location_suggest': locationSuggest,
};
