import { z } from 'zod';
import type { ZodSchema } from 'zod';

const baseMarineSchema = z
  .object({
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .describe(
        'Latitude of the ocean location in decimal degrees (e.g. 51.5 for English Channel, 48.5 for Bay of Biscay). Must be over open water — land coordinates return null values.',
      ),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe(
        'Longitude of the ocean location in decimal degrees (e.g. -14.0 for Atlantic, 2.3 for North Sea).',
      ),
    forecast_days: z
      .number()
      .int()
      .min(1)
      .max(16)
      .optional()
      .describe(
        'Number of days to forecast (1–16). Defaults to 7. Hourly data is returned for each day.',
      ),
    timezone: z
      .string()
      .optional()
      .describe(
        'Timezone for the returned time values (e.g. "UTC", "Europe/London", "America/New_York"). Defaults to UTC.',
      ),
  })
  .strip();

export const marineSchemas: Record<string, ZodSchema> = {
  'marine.forecast': baseMarineSchema.describe(
    'Comprehensive hourly marine forecast at an ocean coordinate. Returns all variables: wave height, wave direction, wave period, swell height, swell direction, swell period, and sea surface temperature.',
  ),

  'marine.wave_conditions': baseMarineSchema.describe(
    'Hourly wave conditions forecast at an ocean coordinate. Returns wave height (m), wave direction (°), and wave period (s).',
  ),

  'marine.swell_forecast': baseMarineSchema.describe(
    'Hourly swell forecast at an ocean coordinate. Returns swell wave height (m), swell direction (°), and swell period (s). Useful for surfing, sailing, and coastal planning.',
  ),

  'marine.sea_temperature': baseMarineSchema.describe(
    'Hourly sea surface temperature (SST) forecast at an ocean coordinate. Returns temperature in degrees Celsius.',
  ),
};
