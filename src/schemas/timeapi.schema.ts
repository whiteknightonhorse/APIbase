import { z, type ZodSchema } from 'zod';

const current = z.object({
  timezone: z.string().describe('IANA timezone name (e.g. "America/New_York", "Europe/London", "Asia/Tokyo", "UTC")'),
}).strip();

const convert = z.object({
  from_timezone: z.string().describe('Source IANA timezone (e.g. "America/New_York")'),
  datetime: z.string().describe('Date and time to convert in "YYYY-MM-DD HH:mm:ss" format (e.g. "2026-03-20 12:00:00")'),
  to_timezone: z.string().describe('Target IANA timezone (e.g. "Asia/Tokyo")'),
}).strip();

const zones = z.object({
  filter: z.string().optional().describe('Optional prefix filter for timezone names (e.g. "America", "Europe", "Asia"). Returns all 597 zones if omitted.'),
}).strip();

export const timeapiSchemas: Record<string, ZodSchema> = {
  'worldclock.current': current,
  'worldclock.convert': convert,
  'worldclock.zones': zones,
};
