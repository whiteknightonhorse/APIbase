import { z, type ZodSchema } from 'zod';

const disasters = z
  .object({
    state: z
      .string()
      .length(2)
      .optional()
      .describe('US state code (e.g. CA, TX, FL). Omit for all states.'),
    incident_type: z
      .enum([
        'Fire',
        'Flood',
        'Hurricane',
        'Tornado',
        'Earthquake',
        'Severe Storm(s)',
        'Snow',
        'Drought',
        'Typhoon',
        'Biological',
        'Other',
      ])
      .optional()
      .describe('Disaster type to filter (e.g. Fire, Flood, Hurricane)'),
    year: z
      .number()
      .int()
      .min(1953)
      .max(2026)
      .optional()
      .describe('Filter by declaration year (1953-2026)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results (1-50, default 10)'),
  })
  .strip();

const floodClaims = z
  .object({
    state: z.string().length(2).describe('US state code (e.g. FL, TX, LA)'),
    year: z
      .number()
      .int()
      .min(1970)
      .max(2026)
      .optional()
      .describe('Year of loss to filter (e.g. 2024)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results (1-50, default 10)'),
  })
  .strip();

const assistance = z
  .object({
    state: z.string().length(2).describe('US state code (e.g. TX, FL, CA)'),
    disaster_number: z
      .number()
      .int()
      .optional()
      .describe('FEMA disaster number to filter (e.g. 4673)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results (1-50, default 10)'),
  })
  .strip();

export const femaSchemas: Record<string, ZodSchema> = {
  'fema.disasters': disasters,
  'fema.flood_claims': floodClaims,
  'fema.assistance': assistance,
};
