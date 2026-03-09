import { z, type ZodSchema } from 'zod';

const unitsEnum = z.enum(['metric', 'imperial']);

const weatherGetCurrent = z
  .object({
    location: z.string(),
    units: unitsEnum.optional(),
  })
  .strip();

const weatherGetForecast = z
  .object({
    location: z.string(),
    type: z.enum(['hourly', 'daily', 'both']).optional(),
    units: unitsEnum.optional(),
  })
  .strip();

const weatherGetAlerts = z
  .object({
    location: z.string(),
  })
  .strip();

const weatherGetHistory = z
  .object({
    location: z.string(),
    date: z.string(),
    units: unitsEnum.optional(),
  })
  .strip();

const weatherAirQuality = z
  .object({
    location: z.string(),
    include_forecast: z.boolean().optional(),
  })
  .strip();

const weatherGeocode = z
  .object({
    query: z.string(),
    type: z.enum(['forward', 'reverse']).optional(),
    limit: z.number().int().max(5).optional(),
  })
  .strip();

const weatherCompare = z
  .object({
    locations: z.array(z.string()).min(2).max(5),
    units: unitsEnum.optional(),
  })
  .strip();

export const weatherSchemas: Record<string, ZodSchema> = {
  'weather.get_current': weatherGetCurrent,
  'weather.get_forecast': weatherGetForecast,
  'weather.get_alerts': weatherGetAlerts,
  'weather.get_history': weatherGetHistory,
  'weather.air_quality': weatherAirQuality,
  'weather.geocode': weatherGeocode,
  'weather.compare': weatherCompare,
};
