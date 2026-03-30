import { z, type ZodSchema } from 'zod';

const rates = z
  .object({
    from_zip: z.string().min(1).describe('Origin US ZIP code (e.g. "10001" for NYC)'),
    to_zip: z.string().min(1).describe('Destination US ZIP code (e.g. "90210" for Beverly Hills)'),
    weight_lb: z.number().min(0.1).describe('Package weight in pounds (e.g. 5)'),
    length: z.number().optional().describe('Package length in inches'),
    width: z.number().optional().describe('Package width in inches'),
    height: z.number().optional().describe('Package height in inches'),
    from_country: z.string().optional().default('US').describe('Origin country code (default US)'),
    to_country: z
      .string()
      .optional()
      .default('US')
      .describe('Destination country code (default US)'),
  })
  .strip();

const validate = z
  .object({
    address_line1: z.string().min(1).describe('Street address (e.g. "1 E 161 St")'),
    address_line2: z.string().optional().describe('Apartment, suite, unit (e.g. "Apt 4B")'),
    city: z.string().optional().describe('City name (e.g. "Bronx")'),
    state: z.string().optional().describe('State code (e.g. "NY")'),
    postal_code: z.string().optional().describe('ZIP code (e.g. "10451")'),
    country: z.string().optional().default('US').describe('Country code (default US)'),
  })
  .strip();

const carriers = z
  .object({
    filter: z
      .string()
      .optional()
      .describe(
        'Optional filter on carrier name (e.g. "ups", "usps"). Returns all connected carriers if omitted',
      ),
  })
  .strip();

export const shipengineSchemas: Record<string, ZodSchema> = {
  'shipengine.rates': rates,
  'shipengine.validate': validate,
  'shipengine.carriers': carriers,
};
