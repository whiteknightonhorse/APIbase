import { z, type ZodSchema } from 'zod';

const current = z
  .object({
    q: z
      .string()
      .min(1)
      .describe(
        'Location query — city name (e.g. "London"), coordinates ("48.8,2.35"), US zip ("10001"), UK postcode ("SW1"), IP address, or IATA airport code ("JFK")',
      ),
  })
  .strip();

const forecast = z
  .object({
    q: z
      .string()
      .min(1)
      .describe('Location query — city name, coordinates, zip code, or airport code'),
    days: z
      .number()
      .int()
      .min(1)
      .max(3)
      .optional()
      .default(3)
      .describe('Forecast days (1-3, default 3)'),
  })
  .strip();

const astronomy = z
  .object({
    q: z.string().min(1).describe('Location query — city name, coordinates, or zip code'),
    date: z.string().optional().describe('Date for astronomy data (YYYY-MM-DD, default today)'),
  })
  .strip();

const search = z
  .object({
    q: z
      .string()
      .min(1)
      .describe(
        'Search query — partial city name for autocomplete (e.g. "lon" → London, "mos" → Moscow)',
      ),
  })
  .strip();

export const weatherapiSchemas: Record<string, ZodSchema> = {
  'weatherapi.current': current,
  'weatherapi.forecast': forecast,
  'weatherapi.astronomy': astronomy,
  'weatherapi.search': search,
};
