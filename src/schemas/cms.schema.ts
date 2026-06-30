import { z } from 'zod';

export const cmsSchemas: Record<string, z.ZodType> = {
  'cms.hospital_search': z
    .object({
      state: z
        .string()
        .length(2)
        .optional()
        .describe(
          'Two-letter US state abbreviation to filter hospitals (e.g. CA, NY, TX). ' +
            'Returns all hospitals in the state when specified.',
        ),
      city: z
        .string()
        .optional()
        .describe(
          'City or town name to filter hospitals (partial match, case-insensitive). ' +
            'Example: "Los Angeles", "Boston".',
        ),
      zip_code: z
        .string()
        .optional()
        .describe(
          '5-digit US ZIP code to filter hospitals by location. ' + 'Example: "90210", "10001".',
        ),
      name: z
        .string()
        .optional()
        .describe(
          'Partial hospital name to search (case-insensitive substring match). ' +
            'Example: "Memorial", "General Hospital", "St. Mary".',
        ),
      hospital_type: z
        .enum([
          'Acute Care Hospitals',
          'Critical Access Hospitals',
          'Childrens',
          'Psychiatric',
          'Rehabilitation',
          'Long-Term Care',
        ])
        .optional()
        .describe(
          'Filter by hospital type classification. ' +
            'Most common: "Acute Care Hospitals" (general hospitals), ' +
            '"Critical Access Hospitals" (rural/small), "Childrens" (pediatric).',
        ),
      min_rating: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe(
          'Minimum CMS Overall Hospital Star Rating (1–5 stars). ' +
            'Filter to only return hospitals with rating >= this value. ' +
            'Example: 4 returns 4-star and 5-star hospitals only.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Maximum number of hospitals to return (1–100, default 20).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe('Number of results to skip for pagination (default 0).'),
    })
    .strip(),

  'cms.nursing_home_search': z
    .object({
      state: z
        .string()
        .length(2)
        .optional()
        .describe('Two-letter US state abbreviation to filter nursing homes (e.g. FL, CA, TX).'),
      city: z
        .string()
        .optional()
        .describe(
          'City or town name to filter nursing homes (partial match). ' +
            'Example: "Miami", "Chicago".',
        ),
      zip_code: z
        .string()
        .optional()
        .describe('5-digit US ZIP code to filter nursing homes by location.'),
      name: z
        .string()
        .optional()
        .describe(
          'Partial nursing home name to search (case-insensitive substring match). ' +
            'Example: "Sunrise", "Brookdale", "Manor".',
        ),
      min_rating: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe(
          'Minimum CMS Overall Star Rating (1–5 stars). ' +
            'Higher ratings indicate better quality of care based on health inspections, ' +
            'staffing levels, and quality measures.',
        ),
      ownership_type: z
        .string()
        .optional()
        .describe(
          'Filter by ownership type. Common values: ' +
            '"For profit - Corporation", "Non profit - Corporation", ' +
            '"Government - State", "Government - County", ' +
            '"For profit - Individual".',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Maximum number of nursing homes to return (1–100, default 20).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe('Number of results to skip for pagination (default 0).'),
    })
    .strip(),

  'cms.home_health_search': z
    .object({
      state: z
        .string()
        .length(2)
        .optional()
        .describe(
          'Two-letter US state abbreviation to filter home health agencies (e.g. TX, CA, NY).',
        ),
      city: z
        .string()
        .optional()
        .describe(
          'City or town name to filter agencies (partial match). ' +
            'Example: "Houston", "Phoenix".',
        ),
      zip_code: z
        .string()
        .optional()
        .describe('5-digit US ZIP code to filter home health agencies.'),
      name: z
        .string()
        .optional()
        .describe(
          'Partial agency name to search (case-insensitive substring match). ' +
            'Example: "Amedisys", "LHC Group", "Encompass".',
        ),
      offers_nursing: z
        .boolean()
        .optional()
        .describe(
          'When true, filter to only agencies that offer skilled nursing care services. ' +
            'Skilled nursing covers wound care, injections, IV therapy, and post-surgery monitoring.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Maximum number of agencies to return (1–100, default 20).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe('Number of results to skip for pagination (default 0).'),
    })
    .strip(),

  'cms.dialysis_search': z
    .object({
      state: z
        .string()
        .length(2)
        .optional()
        .describe(
          'Two-letter US state abbreviation to filter dialysis facilities (e.g. CA, FL, TX).',
        ),
      city: z
        .string()
        .optional()
        .describe(
          'City or town name to filter dialysis facilities (partial match). ' +
            'Example: "Atlanta", "Denver".',
        ),
      zip_code: z
        .string()
        .optional()
        .describe('5-digit US ZIP code to filter dialysis facilities.'),
      name: z
        .string()
        .optional()
        .describe(
          'Partial facility name to search (case-insensitive substring match). ' +
            'Example: "DaVita", "Fresenius", "Dialysis Center".',
        ),
      nonprofit_only: z
        .boolean()
        .optional()
        .describe(
          'When true, filter to only non-profit dialysis facilities. ' +
            'Non-profit facilities may have different care incentives vs. for-profit chains.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Maximum number of dialysis facilities to return (1–100, default 20).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe('Number of results to skip for pagination (default 0).'),
    })
    .strip(),
};
