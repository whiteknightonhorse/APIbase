import { z } from 'zod';
import type { ZodSchema } from 'zod';

const OFFENSE_TYPES = [
  'violent-crime',
  'property-crime',
  'homicide',
  'rape',
  'robbery',
  'aggravated-assault',
  'burglary',
  'larceny',
  'motor-vehicle-theft',
  'arson',
] as const;

const OFFENSE_ENUM = z
  .enum(OFFENSE_TYPES)
  .describe(
    'FBI UCR offense category. violent-crime (murder+rape+robbery+assault), property-crime (burglary+larceny+auto+arson), or individual offense type',
  );

const FROM_MONTH = z
  .string()
  .regex(/^\d{2}-\d{4}$/)
  .describe('Start month in MM-YYYY format (e.g. 01-2019). Data available from 01-1979.');

const TO_MONTH = z
  .string()
  .regex(/^\d{2}-\d{4}$/)
  .describe('End month in MM-YYYY format (e.g. 12-2022). Defaults to last full year.');

const FROM_YEAR = z
  .number()
  .int()
  .min(1979)
  .max(2030)
  .describe('Start year for annual trend data (e.g. 2010). Data available from 1979.');

const TO_YEAR = z
  .number()
  .int()
  .min(1979)
  .max(2030)
  .describe('End year for annual trend data inclusive (e.g. 2022). Defaults to last full year.');

const STATE_CODE = z
  .string()
  .length(2)
  .toUpperCase()
  .describe(
    'Two-letter US state abbreviation (e.g. CA, TX, NY, FL). All 50 states + DC supported.',
  );

export const fbiSchemas: Record<string, ZodSchema> = {
  'fbi.national_offenses': z
    .object({
      offense_type: OFFENSE_ENUM,
      from_month: FROM_MONTH.optional(),
      to_month: TO_MONTH.optional(),
    })
    .strip()
    .describe(
      'Get national UCR crime statistics. Returns monthly actuals, rates per 100k, and clearance counts.',
    ),

  'fbi.state_offenses': z
    .object({
      state: STATE_CODE,
      offense_type: OFFENSE_ENUM,
      from_month: FROM_MONTH.optional(),
      to_month: TO_MONTH.optional(),
    })
    .strip()
    .describe(
      'Get state UCR crime statistics compared to the national average for the same offense type.',
    ),

  'fbi.national_annual': z
    .object({
      offense_type: OFFENSE_ENUM,
      from_year: FROM_YEAR.optional(),
      to_year: TO_YEAR.optional(),
    })
    .strip()
    .describe(
      'Get national UCR annual crime totals (aggregated from monthly). Ideal for multi-year trend analysis.',
    ),

  'fbi.state_annual': z
    .object({
      state: STATE_CODE,
      offense_type: OFFENSE_ENUM,
      from_year: FROM_YEAR.optional(),
      to_year: TO_YEAR.optional(),
    })
    .strip()
    .describe(
      'Get state UCR annual crime totals with national comparison. Useful for year-over-year state trend analysis.',
    ),
};
