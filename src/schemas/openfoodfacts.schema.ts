import { z, type ZodSchema } from 'zod';
const barcode = z.object({ barcode: z.string().min(8).max(13).describe('Product barcode (EAN-13, UPC-A, etc.) e.g. "3017620422003" for Nutella') }).strip();
const search = z.object({ query: z.string().min(2).describe('Product name to search (e.g. "nutella", "coca cola", "organic milk")'), limit: z.number().int().min(1).max(50).optional().describe('Results count (default 10, max 50)') }).strip();
export const openfoodfactsSchemas: Record<string, ZodSchema> = { 'food.barcode': barcode, 'food.search': search };
