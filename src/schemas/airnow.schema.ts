import { z, type ZodSchema } from 'zod';

const zipShape = z
  .object({
    zip: z
      .string()
      .min(5)
      .max(5)
      .describe(
        'US ZIP code — 5 digits (e.g. "10001" Manhattan, "90210" Beverly Hills, "60601" Chicago).',
      ),
    distance: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe(
        'Search radius in miles around the ZIP centroid (default 25). If no monitor within radius, returns empty array.',
      ),
  })
  .strip();

const latlngShape = z
  .object({
    lat: z.number().describe('Latitude (decimal degrees, e.g. 40.7128 for NYC).'),
    lng: z.number().describe('Longitude (decimal degrees, e.g. -74.0060 for NYC).'),
    distance: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Search radius in miles around the coordinate (default 25).'),
  })
  .strip();

const forecastZip = zipShape.extend({
  date: z
    .string()
    .optional()
    .describe('Optional ISO date YYYY-MM-DD to get forecast for that day. Default: today.'),
});

const forecastLatLng = latlngShape.extend({
  date: z
    .string()
    .optional()
    .describe('Optional ISO date YYYY-MM-DD to get forecast for that day. Default: today.'),
});

export const airnowSchemas: Record<string, ZodSchema> = {
  'airnow.current_zip': zipShape,
  'airnow.current_latlng': latlngShape,
  'airnow.forecast_zip': forecastZip,
  'airnow.forecast_latlng': forecastLatLng,
};
