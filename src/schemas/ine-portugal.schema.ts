import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// ine-portugal.indicator_data — fetch observation data for an INE indicator
// ---------------------------------------------------------------------------

const inePortugalIndicatorData = z
  .object({
    varcd: z
      .string()
      .min(1)
      .max(7)
      .regex(/^\d{1,7}$/, 'varcd must be numeric digits only')
      .describe(
        'INE (Statistics Portugal) 7-digit indicator code, zero-padded (e.g. "0008273" for ' +
          'resident population by NUTS/sex/age group). There is no upstream search/catalog ' +
          'endpoint — find valid codes via the official INE indicator database ' +
          '(www.ine.pt/xportal) or ine-portugal.indicator_metadata once you have a code.',
      ),
    dim1: z
      .string()
      .optional()
      .describe(
        'Filter code for Dimension 1 (usually the reference period, e.g. "S7A2023" for year ' +
          '2023 or "2023" depending on the indicator). Get valid codes from ' +
          'ine-portugal.indicator_metadata before calling. Omit to fetch data across all periods.',
      ),
    dim2: z
      .string()
      .optional()
      .describe(
        'Filter code for Dimension 2 (indicator-specific, e.g. a NUTS geography code). Get ' +
          'valid codes from ine-portugal.indicator_metadata. Omit to include all values of this dimension.',
      ),
    dim3: z
      .string()
      .optional()
      .describe(
        'Filter code for Dimension 3 (indicator-specific, e.g. sex). Get valid codes from ' +
          'ine-portugal.indicator_metadata. Omit to include all values of this dimension.',
      ),
    dim4: z
      .string()
      .optional()
      .describe(
        'Filter code for Dimension 4 (indicator-specific, e.g. age group). Get valid codes ' +
          'from ine-portugal.indicator_metadata. Omit to include all values of this dimension.',
      ),
    dim5: z
      .string()
      .optional()
      .describe(
        'Filter code for Dimension 5, if the indicator has one. Get valid codes from ' +
          'ine-portugal.indicator_metadata. Omit to include all values of this dimension.',
      ),
    dim6: z
      .string()
      .optional()
      .describe(
        'Filter code for Dimension 6, if the indicator has one. Get valid codes from ' +
          'ine-portugal.indicator_metadata. Omit to include all values of this dimension.',
      ),
    lang: z
      .enum(['EN', 'PT'])
      .optional()
      .describe('Response language for labels: "EN" (English, default) or "PT" (Portuguese).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// ine-portugal.indicator_metadata — fetch dimensions/valid codes for an indicator
// ---------------------------------------------------------------------------

const inePortugalIndicatorMetadata = z
  .object({
    varcd: z
      .string()
      .min(1)
      .max(7)
      .regex(/^\d{1,7}$/, 'varcd must be numeric digits only')
      .describe(
        'INE (Statistics Portugal) 7-digit indicator code, zero-padded (e.g. "0008273"). ' +
          'Returns the indicator name, periodicity, unit, first/last available period, and ' +
          'every dimension with its valid filter codes — call this BEFORE ' +
          'ine-portugal.indicator_data to discover valid Dim1..Dim6 values.',
      ),
    lang: z
      .enum(['EN', 'PT'])
      .optional()
      .describe('Response language for labels: "EN" (English, default) or "PT" (Portuguese).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const inePortugalSchemas: Record<string, ZodSchema> = {
  'ine-portugal.indicator_data': inePortugalIndicatorData,
  'ine-portugal.indicator_metadata': inePortugalIndicatorMetadata,
};
