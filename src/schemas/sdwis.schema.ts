import { z, type ZodSchema } from 'zod';

const waterSystems = z
  .object({
    state: z
      .string()
      .length(2)
      .optional()
      .describe('US state code or primacy agency code (e.g. CA, TX, FL). Omit for all states.'),
    type: z
      .enum(['CWS', 'TNCWS', 'NTNCWS'])
      .optional()
      .describe(
        'Public water system type: CWS (Community), TNCWS (Transient Non-Community), NTNCWS (Non-Transient Non-Community)',
      ),
    activity: z
      .enum(['A', 'I', 'N', 'M', 'P'])
      .optional()
      .describe(
        'Activity status code: A (Active), I (Inactive), N (New), M (Merger), P (Proposed). Default is all.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of water systems to return (1–100, default 20)'),
  })
  .strip();

const violations = z
  .object({
    state: z
      .string()
      .length(2)
      .optional()
      .describe(
        'State or primacy agency code (e.g. CA, TX). Two-letter abbreviation. Omit for all states.',
      ),
    health_based: z
      .boolean()
      .optional()
      .describe(
        'If true, return only health-based violations (MCL, TT, MRDL). If false or omitted, return all.',
      ),
    category: z
      .enum(['MCL', 'TT', 'MRDL', 'MR', 'MON', 'RPT', 'PN', 'OTHER'])
      .optional()
      .describe(
        'Violation category: MCL (Maximum Contaminant Level), TT (Treatment Technique), MRDL (Disinfectant), MR (Monitoring/Reporting), MON (Monitoring), RPT (Reporting), PN (Public Notification), OTHER',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of violations to return (1–100, default 20)'),
  })
  .strip();

const enforcement = z
  .object({
    pwsid: z
      .string()
      .optional()
      .describe(
        'Public Water System Identifier (PWSID) to look up enforcement actions for a specific system (e.g. CA3310067)',
      ),
    action_type: z
      .string()
      .length(3)
      .optional()
      .describe(
        'Enforcement action type code (e.g. EFG for Formal Enforcement Order, 3EF for Third Violation)',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of enforcement actions to return (1–100, default 20)'),
  })
  .strip();

const serviceAreas = z
  .object({
    state: z
      .string()
      .length(2)
      .optional()
      .describe('State or primacy agency code to filter service areas (e.g. CA, TX, FL)'),
    pwsid: z
      .string()
      .optional()
      .describe(
        'Public Water System Identifier (PWSID) to get service areas for a specific system (e.g. CA3310067)',
      ),
    county: z
      .string()
      .optional()
      .describe('County name served by the water system (e.g. LOS ANGELES)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of service area records to return (1–100, default 20)'),
  })
  .strip();

export const sdwisSchemas: Record<string, ZodSchema> = {
  'sdwis.water_systems': waterSystems,
  'sdwis.violations': violations,
  'sdwis.enforcement': enforcement,
  'sdwis.service_areas': serviceAreas,
};
