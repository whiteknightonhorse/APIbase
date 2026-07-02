import { z } from 'zod';
import type { ZodSchema } from 'zod';

const areaCodeParam = z
  .string()
  .regex(/^\d{6}$/)
  .describe(
    'JMA 6-digit area (office) code. Use jma-bosai.reference.areas to look up valid codes. ' +
      'Common codes: 130000 (Tokyo), 270000 (Osaka), 230000 (Aichi/Nagoya), 400000 (Fukuoka).',
  );

export const jmaBosaiSchemas: Record<string, ZodSchema> = {
  'jma-bosai.forecast': z
    .object({
      area_code: areaCodeParam.default('130000'),
    })
    .strip(),

  'jma-bosai.overview': z
    .object({
      area_code: areaCodeParam.default('130000'),
    })
    .strip(),

  'jma-bosai.warnings': z
    .object({
      area_code: areaCodeParam.default('130000'),
    })
    .strip(),

  'jma-bosai.earthquakes': z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of earthquakes to return (1–100). Defaults to 20.'),
      min_magnitude: z
        .number()
        .min(0)
        .max(9.9)
        .optional()
        .describe('Filter — return only earthquakes with magnitude ≥ this value (e.g. 3.0).'),
    })
    .strip(),

  'jma-bosai.areas': z
    .object({
      name_filter: z
        .string()
        .optional()
        .describe(
          'Optional English keyword to filter offices by name (case-insensitive). ' +
            'E.g. "tokyo", "osaka". Leave empty to return all 58 offices.',
        ),
    })
    .strip(),
};
