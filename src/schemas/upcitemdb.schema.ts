import { z, type ZodSchema } from 'zod';

const lookup = z
  .object({
    upc: z
      .string()
      .describe('UPC, EAN, GTIN, or ISBN barcode number to look up (e.g. "012345678905", "9780140449136")'),
  })
  .strip();

const search = z
  .object({
    query: z
      .string()
      .describe('Full-text search query for product name, brand, or description (e.g. "iPhone 16", "Sony headphones")'),
    match_mode: z
      .number()
      .int()
      .min(0)
      .max(1)
      .optional()
      .describe('Match mode: 0 = broad match (default), 1 = exact match'),
    type: z
      .enum(['product', 'brand', 'category'])
      .optional()
      .describe('Search type: "product" (default), "brand", or "category"'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset for results (default: 0)'),
  })
  .strip();

export const upcitemdbSchemas: Record<string, ZodSchema> = {
  'upc.lookup': lookup,
  'upc.search': search,
};
