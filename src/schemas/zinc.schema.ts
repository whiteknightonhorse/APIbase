import { z, type ZodSchema } from 'zod';

const zincRetailer = z
  .enum(['amazon', 'walmart', 'amazon_uk', 'amazon_ca', 'amazon_de', 'amazon_fr', 'amazon_it', 'amazon_es', 'amazon_in', 'amazon_jp'])
  .optional()
  .describe('Retailer to search (default: amazon)');

const zincProductSearch = z
  .object({
    query: z.string().describe('Product search query (e.g. "wireless headphones", "laptop stand")'),
    retailer: zincRetailer,
    page: z.number().int().min(1).max(20).optional().describe('Results page number (1-20, default 1)'),
  })
  .strip();

const zincProductDetails = z
  .object({
    product_id: z.string().describe('Product ID or ASIN (e.g. "B09V3KXJPB")'),
    retailer: zincRetailer,
  })
  .strip();

const zincProductOffers = z
  .object({
    product_id: z.string().describe('Product ID or ASIN to get seller offers for'),
    retailer: zincRetailer,
  })
  .strip();

const zincProductReviews = z
  .object({
    product_id: z.string().describe('Product ID or ASIN to get reviews for'),
    retailer: zincRetailer,
    page: z.number().int().min(1).max(20).optional().describe('Reviews page number (1-20, default 1)'),
  })
  .strip();

export const zincSchemas: Record<string, ZodSchema> = {
  'zinc.product_search': zincProductSearch,
  'zinc.product_details': zincProductDetails,
  'zinc.product_offers': zincProductOffers,
  'zinc.product_reviews': zincProductReviews,
};
