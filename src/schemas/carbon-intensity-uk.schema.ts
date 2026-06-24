import { z, type ZodSchema } from 'zod';

const current = z
  .object({
    locale: z.string().optional().describe('Reserved for future use. Omit for standard response.'),
  })
  .strip();

const generation = z
  .object({
    locale: z.string().optional().describe('Reserved for future use. Omit for standard response.'),
  })
  .strip();

const regional = z
  .object({
    region_id: z
      .number()
      .int()
      .min(1)
      .max(18)
      .optional()
      .describe(
        'UK DNO region ID (1–14 for primary regions, up to 18 for all). Omit to return all regions. ' +
          '1=North Scotland, 2=South Scotland, 3=North West England, 4=North East England, 5=Yorkshire, ' +
          '6=North Wales & Mersey, 7=South Wales, 8=West Midlands, 9=East Midlands, 10=East England, ' +
          '11=South West England, 12=South England, 13=London, 14=South East England',
      ),
  })
  .strip();

const forecast = z
  .object({
    periods: z
      .number()
      .int()
      .min(1)
      .max(48)
      .optional()
      .describe(
        'Number of 30-minute forecast periods to return (1–48, default: all 48 covering 24 hours)',
      ),
  })
  .strip();

export const carbonIntensityUkSchemas: Record<string, ZodSchema> = {
  'carbonintensity.current': current,
  'carbonintensity.generation': generation,
  'carbonintensity.regional': regional,
  'carbonintensity.forecast': forecast,
};
