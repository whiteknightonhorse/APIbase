import { z, type ZodSchema } from 'zod';
const barcode = z
  .object({
    barcode: z
      .string()
      .min(8)
      .max(13)
      .describe('Product barcode (EAN-13, UPC-A, etc.) e.g. "3600523327164" for a shampoo'),
  })
  .strip();
const search = z
  .object({
    query: z
      .string()
      .min(2)
      .describe(
        'Cosmetics/personal-care product name to search (e.g. "shampoo", "lipstick", "sunscreen")',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Results count (default 10, max 50)'),
  })
  .strip();
export const openbeautyfactsSchemas: Record<string, ZodSchema> = {
  'openbeautyfacts.barcode': barcode,
  'openbeautyfacts.search': search,
};
