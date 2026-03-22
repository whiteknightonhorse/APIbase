import { z, type ZodSchema } from 'zod';

const vinDecode = z.object({
  vin: z.string().length(17).describe('17-character Vehicle Identification Number (e.g. "WP0AF2A99KS165242" for Porsche, "WBAFR7C51BC603689" for BMW)'),
}).strip();

export const autodevSchemas: Record<string, ZodSchema> = {
  'autodev.vin_decode': vinDecode,
};
