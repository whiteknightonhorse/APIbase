import { z, type ZodSchema } from 'zod';

const limit = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe('Max rows to return (1-100, default 25).');
const offset = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('Rows to skip for pagination (default 0).');

// noaa-fisheries-stats.landings — US commercial/recreational landings (FOSS)
const landings = z
  .object({
    species: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe('Species name substring, case-insensitive (e.g. "salmon", "pollock", "lobster").'),
    state: z
      .string()
      .min(2)
      .max(40)
      .optional()
      .describe('US state name, case-insensitive (e.g. "Alaska", "Maine", "Hawaii").'),
    region: z
      .string()
      .min(2)
      .max(60)
      .optional()
      .describe('NOAA Fisheries region name (e.g. "Alaska", "Hawaii", "Southeast").'),
    collection: z
      .enum(['Commercial', 'Recreational'])
      .optional()
      .describe('Landings type: Commercial (pounds + dollars) or Recreational (fish counts).'),
    year_from: z
      .number()
      .int()
      .min(1900)
      .max(2100)
      .optional()
      .describe('First year (inclusive), e.g. 2015.'),
    year_to: z
      .number()
      .int()
      .min(1900)
      .max(2100)
      .optional()
      .describe('Last year (inclusive), e.g. 2022.'),
    limit,
    offset,
  })
  .strip();

// noaa-fisheries-stats.survey_species — AFSC groundfish survey species lookup
const surveySpecies = z
  .object({
    common_name: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe('Common name substring, matched lowercase (e.g. "pollock", "halibut").'),
    scientific_name: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe('Scientific name substring, case-sensitive (e.g. "Gadus", "Hippoglossus").'),
    limit,
    offset,
  })
  .strip();

// noaa-fisheries-stats.survey_catch — AFSC groundfish survey catch per haul
const surveyCatch = z
  .object({
    species_code: z
      .number()
      .int()
      .positive()
      .describe('AFSC survey species code from survey_species (e.g. 21740 = walleye pollock).'),
    hauljoin: z.number().int().optional().describe('Restrict to a single survey haul ID.'),
    limit,
    offset,
  })
  .strip();

export const noaaFisheriesStatsSchemas: Record<string, ZodSchema> = {
  'noaa-fisheries-stats.landings': landings,
  'noaa-fisheries-stats.survey_species': surveySpecies,
  'noaa-fisheries-stats.survey_catch': surveyCatch,
};
