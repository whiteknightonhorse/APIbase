import { z, type ZodSchema } from 'zod';

const closeApproaches = z
  .object({
    date_min: z
      .string()
      .optional()
      .describe('Minimum close-approach date in YYYY-MM-DD format (default: now)'),
    date_max: z
      .string()
      .optional()
      .describe('Maximum close-approach date in YYYY-MM-DD format (default: +60 days)'),
    dist_max: z
      .string()
      .optional()
      .describe('Maximum approach distance in AU (e.g. "0.05" = ~7.5M km). Default: 0.05'),
    h_max: z
      .number()
      .optional()
      .describe('Maximum absolute magnitude H (smaller H = larger object). Filter for brighter/bigger asteroids'),
    sort: z
      .enum(['date', 'dist', 'dist-min', 'h', 'v-inf', 'v-rel'])
      .optional()
      .describe('Sort field (default: date)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of results (default 20, max 100)'),
  })
  .strip();

const fireballs = z
  .object({
    date_min: z
      .string()
      .optional()
      .describe('Minimum event date in YYYY-MM-DD format'),
    date_max: z
      .string()
      .optional()
      .describe('Maximum event date in YYYY-MM-DD format'),
    energy_min: z
      .number()
      .optional()
      .describe('Minimum radiated energy in Joules (e.g. 1e10)'),
    sort: z
      .enum(['date', 'energy', 'impact-e', 'vel', 'alt'])
      .optional()
      .describe('Sort field (default: date descending)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of results (default 20, max 100)'),
  })
  .strip();

const smallBody = z
  .object({
    sstr: z
      .string()
      .optional()
      .describe('Search string — asteroid/comet name or designation (e.g. "Apophis", "2024 YR4", "Halley")'),
    des: z
      .string()
      .optional()
      .describe('SPK-ID or designation for exact lookup (e.g. "99942" for Apophis)'),
    phys_par: z
      .boolean()
      .optional()
      .describe('Include physical parameters like diameter, albedo, rotation period (default true)'),
  })
  .strip();

const impactRisk = z
  .object({
    des: z
      .string()
      .optional()
      .describe('Asteroid designation to check specific object (e.g. "99942" for Apophis). Omit for full list'),
    h_max: z
      .number()
      .optional()
      .describe('Maximum absolute magnitude H — filter for larger objects'),
    ps_min: z
      .number()
      .optional()
      .describe('Minimum Palermo Scale value (e.g. -3). Higher = more concerning'),
    ip_min: z
      .number()
      .optional()
      .describe('Minimum impact probability (e.g. 1e-7)'),
  })
  .strip();

export const jplSchemas: Record<string, ZodSchema> = {
  'jpl.close_approaches': closeApproaches,
  'jpl.fireballs': fireballs,
  'jpl.small_body': smallBody,
  'jpl.impact_risk': impactRisk,
};
