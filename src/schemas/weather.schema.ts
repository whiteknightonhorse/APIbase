import { z, type ZodSchema } from 'zod';

const unitsEnum = z.enum(['metric', 'imperial']).describe('Temperature units system');

const weatherGetCurrent = z
  .object({
    location: z.string().describe('City name, coordinates (lat,lon), or zip code'),
    units: unitsEnum.optional(),
  })
  .strip();

const weatherGetForecast = z
  .object({
    location: z.string().describe('City name, coordinates (lat,lon), or zip code'),
    type: z.enum(['hourly', 'daily', 'both']).optional().describe('Forecast granularity'),
    units: unitsEnum.optional(),
  })
  .strip();

const weatherGetAlerts = z
  .object({
    location: z.string().describe('City name, coordinates (lat,lon), or zip code'),
  })
  .strip();

const weatherGetHistory = z
  .object({
    location: z.string().describe('City name, coordinates (lat,lon), or zip code'),
    date: z.string().describe('Historical date in YYYY-MM-DD format'),
    units: unitsEnum.optional(),
  })
  .strip();

const weatherAirQuality = z
  .object({
    location: z.string().describe('City name, coordinates (lat,lon), or zip code'),
    include_forecast: z.boolean().optional().describe('Include air quality forecast for next 24h'),
  })
  .strip();

const weatherGeocode = z
  .object({
    query: z.string().describe('Location name or coordinates to geocode'),
    type: z.enum(['forward', 'reverse']).optional().describe('Geocoding direction'),
    limit: z.number().int().max(5).optional().describe('Max number of results (1-5)'),
  })
  .strip();

const weatherCompare = z
  .object({
    locations: z.array(z.string().describe('City name or coordinates')).min(2).max(5).describe('List of 2-5 locations to compare'),
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
