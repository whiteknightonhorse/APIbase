import { z, type ZodSchema } from 'zod';

const search = z.object({
  make: z.string().optional().describe('Car manufacturer (e.g. "Toyota", "Honda", "BMW", "Tesla")'),
  model: z.string().optional().describe('Car model (e.g. "Camry", "Civic", "Model 3")'),
  year: z.number().int().optional().describe('Model year (e.g. 2023, 2024)'),
  price_min: z.number().optional().describe('Minimum price in USD'),
  price_max: z.number().optional().describe('Maximum price in USD'),
  miles_max: z.number().optional().describe('Maximum mileage'),
  zip: z.string().optional().describe('US ZIP code to search near (e.g. "10001")'),
  radius: z.number().optional().describe('Search radius in miles from ZIP (max 100 on free tier)'),
  seller_type: z.enum(['dealer', 'private']).optional().describe('Filter by seller type'),
  exterior_color: z.string().optional().describe('Filter by exterior color (e.g. "White", "Black", "Red")'),
  limit: z.number().int().min(1).max(25).optional().default(10).describe('Max results (1-25, default 10)'),
  start: z.number().int().min(0).optional().describe('Offset for pagination'),
}).strip();

const listing = z.object({
  id: z.string().min(1).describe('MarketCheck listing ID (e.g. "3TMCZ5AN5PM564843-883937ce-f335"). Get IDs from carmarket.search results'),
}).strip();

export const marketcheckSchemas: Record<string, ZodSchema> = {
  'carmarket.search': search,
  'carmarket.listing': listing,
};
