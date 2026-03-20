import { z, type ZodSchema } from 'zod';

const fires = z.object({
  west: z.number().min(-180).max(180).describe('Western longitude of bounding box (e.g. -125 for California)'),
  south: z.number().min(-90).max(90).describe('Southern latitude of bounding box (e.g. 32)'),
  east: z.number().min(-180).max(180).describe('Eastern longitude of bounding box (e.g. -114)'),
  north: z.number().min(-90).max(90).describe('Northern latitude of bounding box (e.g. 42)'),
  days: z.number().int().min(1).max(5).optional().describe('Number of days of data (1-5, default 1)'),
  source: z.enum(['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'MODIS_NRT']).optional().describe('Satellite sensor: VIIRS_SNPP_NRT (default, highest resolution), MODIS_NRT (legacy)'),
}).strip();

export const firmsSchemas: Record<string, ZodSchema> = {
  'firms.fires': fires,
};
