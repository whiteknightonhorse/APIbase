import { z, type ZodSchema } from 'zod';

const city = z.object({
  city: z.string().min(1).describe('City name (e.g. "Los Angeles", "London", "Tokyo")'),
  state: z.string().min(1).describe('State or province (e.g. "California", "England", "Tokyo")'),
  country: z.string().min(1).describe('Country name (e.g. "USA", "UK", "Japan")'),
}).strip();

const nearest = z.object({
  lat: z.number().min(-90).max(90).describe('Latitude (-90 to 90, e.g. 34.0522)'),
  lon: z.number().min(-180).max(180).describe('Longitude (-180 to 180, e.g. -118.2437)'),
}).strip();

export const iqairSchemas: Record<string, ZodSchema> = {
  'airquality.city': city,
  'airquality.nearest': nearest,
};
