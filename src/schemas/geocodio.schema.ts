import { z, type ZodSchema } from 'zod';

const geocode = z.object({
  address: z.string().min(3).describe('US or Canada address to geocode (e.g. "1600 Pennsylvania Ave NW, Washington DC", "350 5th Ave, New York, NY 10118")'),
  limit: z.number().int().min(1).max(20).optional().describe('Max results to return (default 5, max 20)'),
}).strip();

const reverse = z.object({
  lat: z.number().min(24).max(72).describe('Latitude (24-72 range for US/Canada, e.g. 38.8976)'),
  lon: z.number().min(-180).max(-50).describe('Longitude (negative for Western Hemisphere, e.g. -77.0365)'),
  limit: z.number().int().min(1).max(20).optional().describe('Max results to return (default 5, max 20)'),
}).strip();

export const geocodioSchemas: Record<string, ZodSchema> = {
  'geocodio.geocode': geocode,
  'geocodio.reverse': reverse,
};
