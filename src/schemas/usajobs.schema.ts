import { z } from 'zod';

/**
 * Zod schemas for USAJOBS tools (UC-415).
 * Every field has .describe() — required for Smithery quality score.
 */
export const usajobsSchemas: Record<string, z.ZodSchema> = {
  'usajobs.search': z
    .object({
      keyword: z
        .string()
        .optional()
        .describe(
          "Free-text search across job title + description. Examples: 'software engineer', 'cybersecurity analyst', 'data scientist'.",
        ),
      location_name: z
        .string()
        .optional()
        .describe(
          "Location filter. City + state, ZIP, or state name. Examples: 'Washington, DC', 'San Francisco, CA', '94102'.",
        ),
      pay_grade_low: z
        .string()
        .optional()
        .describe(
          "Minimum federal pay grade. Format: 'GS01'-'GS15', 'SES', or 'EX-V'. Default: any.",
        ),
      pay_grade_high: z
        .string()
        .optional()
        .describe('Maximum federal pay grade (same format as pay_grade_low).'),
      organization: z
        .string()
        .optional()
        .describe(
          "Agency code or name fragment. Examples: 'DOD' (Defense), 'VA' (Veterans Affairs), 'HHS' (Health and Human Services).",
        ),
      position_title: z
        .string()
        .optional()
        .describe('Strict position-title filter. Use keyword for fuzzy match.'),
      results_per_page: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .default(25)
        .describe('Results per page (1-500, default 25).'),
      page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(1)
        .describe('Page number for pagination (default 1).'),
    })
    .strip()
    .describe(
      'Search US federal civil-service job postings by keyword, location, pay grade, agency, or position title.',
    ),

  'usajobs.position_detail': z
    .object({
      control_number: z
        .string()
        .describe(
          'PositionID from a search result (digits-only string, e.g. "856924100"). Found in the MatchedObjectId field.',
        ),
    })
    .strip()
    .describe('Fetch full detail for a specific federal job posting by control number.'),

  'usajobs.code_lists': z
    .object({
      code_list: z
        .enum([
          'agencysubelements',
          'occupationalseries',
          'paygrades',
          'hiringpaths',
          'securityclearances',
          'applicantsuppliers',
          'geoloccodes',
          'postalcodes',
          'cyberworkroles',
          'workschedules',
          'traveldescriptions',
        ])
        .describe(
          'Reference code list name. Options: agencysubelements (all federal agencies and sub-orgs), occupationalseries (4-digit job-family codes, e.g. 2210=IT Specialist), paygrades (GS-1 through SES), hiringpaths (public/veteran/student/disability), securityclearances (Public Trust to TS/SCI), applicantsuppliers (hiring authority types), geoloccodes (geographic location codes), postalcodes (ZIP code lookup), cyberworkroles (NICE Cybersecurity Workforce Framework roles), workschedules (full-time/part-time/intermittent), traveldescriptions (travel requirement levels).',
        ),
    })
    .strip()
    .describe(
      'Fetch reference code lists used by USAJOBS — agency codes, pay grades, hiring paths, occupational series, and more.',
    ),
};
