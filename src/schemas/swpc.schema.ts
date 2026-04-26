import { z, type ZodSchema } from 'zod';

const kIndex = z
  .object({
    points: z
      .number()
      .int()
      .min(1)
      .max(120)
      .optional()
      .describe(
        'Number of recent 1-minute K-index readings to return alongside the latest reading (default 30, max 120). The full 6-hour rolling window is always scanned for the window_max field regardless of this value.',
      ),
  })
  .strip();

const aurora = z
  .object({
    refresh: z
      .boolean()
      .optional()
      .describe(
        'No-op flag for cache busting. Set to true to bypass the 5-minute cache and fetch the latest aurora oval forecast.',
      ),
  })
  .strip();

const solarWind = z
  .object({
    points: z
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .describe(
        'Number of recent 1-minute solar-wind readings to return alongside the latest reading (default 20, max 60). Each reading includes proton speed (km/s), density (per cm³), temperature (K), and quality score.',
      ),
  })
  .strip();

const solarRegions = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe(
        'Max number of active sunspot regions to return, sorted by most recently observed first (default 20, max 50). Each entry includes NOAA AR number, location, magnetic class, and C/M/X-class flare probabilities.',
      ),
  })
  .strip();

export const swpcSchemas: Record<string, ZodSchema> = {
  'swpc.k_index': kIndex,
  'swpc.aurora': aurora,
  'swpc.solar_wind': solarWind,
  'swpc.solar_regions': solarRegions,
};
