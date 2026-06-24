import { z } from 'zod';

const latParam = z
  .number()
  .min(-90)
  .max(90)
  .describe('Latitude of the target location (-90 to 90). Positive = North, Negative = South.');
const lngParam = z
  .number()
  .min(-180)
  .max(180)
  .describe('Longitude of the target location (-180 to 180). Positive = East, Negative = West.');
const timezoneParam = z
  .string()
  .optional()
  .describe(
    'IANA timezone name for output times (e.g. America/New_York, Europe/London, Asia/Tokyo). ' +
      'Auto-detected from lat/lng if omitted.',
  );
const timeFormatParam = z
  .enum(['0', '1', '2'])
  .optional()
  .describe(
    'Time output format: "0"=12-hour AM/PM (e.g. 5:26:02 AM), "1"=24-hour (e.g. 05:26:02), "2"=Unix timestamp seconds. Defaults to "0".',
  );
const dateParam = z
  .string()
  .optional()
  .describe(
    'Date to query: "today", "tomorrow", or ISO date YYYY-MM-DD (e.g. 2026-01-15). Defaults to today.',
  );

export const sunrisesunsetSchemas: Record<string, z.ZodType> = {
  'sunrisesunset.daily': z
    .object({
      lat: latParam,
      lng: lngParam,
      date: dateParam,
      timezone: timezoneParam,
      time_format: timeFormatParam,
    })
    .strip(),

  'sunrisesunset.range': z
    .object({
      lat: latParam,
      lng: lngParam,
      date_start: z
        .string()
        .describe('Start date of range in ISO format YYYY-MM-DD (e.g. 2026-06-01).'),
      date_end: z
        .string()
        .describe(
          'End date of range in ISO format YYYY-MM-DD (e.g. 2026-06-30). Maximum 365 days from start date.',
        ),
      timezone: timezoneParam,
      time_format: timeFormatParam,
    })
    .strip(),

  'sunrisesunset.moon_phase': z
    .object({
      lat: latParam,
      lng: lngParam,
      date: dateParam,
      timezone: timezoneParam,
    })
    .strip(),

  'sunrisesunset.sun_position': z
    .object({
      lat: latParam,
      lng: lngParam,
      date: dateParam,
      timezone: timezoneParam,
      time_format: timeFormatParam,
    })
    .strip(),
};
