import { z, type ZodSchema } from 'zod';

const latLon = {
  latitude: z
    .number()
    .min(24)
    .max(50)
    .describe('Latitude in decimal degrees (US contiguous only: 24–50)'),
  longitude: z
    .number()
    .min(-125)
    .max(-66)
    .describe('Longitude in decimal degrees (US contiguous only: −125 to −66)'),
};

const forecast = z.object(latLon).strip();
const hourly = z.object(latLon).strip();
const observation = z.object(latLon).strip();

export const noaaSchemas: Record<string, ZodSchema> = {
  'noaa.forecast': forecast,
  'noaa.hourly': hourly,
  'noaa.observation': observation,
};
