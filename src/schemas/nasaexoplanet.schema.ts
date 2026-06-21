import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    planet_name: z
      .string()
      .optional()
      .describe('Planet name or partial name to search (e.g. "Kepler-22 b", "TOI-700")'),
    host_name: z
      .string()
      .optional()
      .describe('Host star name or partial name (e.g. "51 Peg", "Kepler-442")'),
    discovery_method: z
      .enum([
        'Transit',
        'Radial Velocity',
        'Microlensing',
        'Imaging',
        'Astrometry',
        'Transit Timing Variations',
        'Orbital Brightness Modulation',
        'Pulsar Timing',
        'Pulsation Timing Variations',
        'Disk Kinematics',
        'Eclipse Timing Variations',
      ])
      .optional()
      .describe('Discovery method filter (e.g. "Transit", "Radial Velocity", "Imaging")'),
    disc_year_min: z
      .number()
      .int()
      .min(1988)
      .max(2030)
      .optional()
      .describe('Minimum discovery year (e.g. 2010 to filter planets found in 2010 or later)'),
    disc_year_max: z
      .number()
      .int()
      .min(1988)
      .max(2030)
      .optional()
      .describe('Maximum discovery year (e.g. 2020 to filter planets found before 2021)'),
    radius_min: z
      .number()
      .min(0)
      .optional()
      .describe('Minimum planet radius in Earth radii (e.g. 0.5 for sub-Earths and above)'),
    radius_max: z
      .number()
      .min(0)
      .optional()
      .describe('Maximum planet radius in Earth radii (e.g. 2.0 for super-Earths; 11 ≈ Jupiter)'),
    mass_min: z
      .number()
      .min(0)
      .optional()
      .describe('Minimum planet mass in Earth masses (e.g. 0.1 for sub-Earths)'),
    mass_max: z
      .number()
      .min(0)
      .optional()
      .describe('Maximum planet mass in Earth masses (e.g. 318 ≈ 1 Jupiter mass)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of results to return (default 20, max 100)'),
  })
  .strip();

const planetDetail = z
  .object({
    planet_name: z
      .string()
      .describe(
        'Exact planet name for detail lookup (e.g. "HD 209458 b", "TRAPPIST-1 e", "Kepler-452 b")',
      ),
  })
  .strip();

const habitable = z
  .object({
    radius_min: z
      .number()
      .min(0)
      .optional()
      .describe('Minimum planet radius in Earth radii (default 0.5 — filters sub-Earth bodies)'),
    radius_max: z
      .number()
      .min(0)
      .optional()
      .describe(
        'Maximum planet radius in Earth radii (default 2.0 — upper limit for rocky planets)',
      ),
    temp_min: z
      .number()
      .min(0)
      .optional()
      .describe(
        'Minimum equilibrium temperature in Kelvin (default 180 — conservative habitable zone lower bound)',
      ),
    temp_max: z
      .number()
      .min(0)
      .optional()
      .describe(
        'Maximum equilibrium temperature in Kelvin (default 310 — conservative habitable zone upper bound)',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of candidates to return (default 20, max 100)'),
  })
  .strip();

const stats = z
  .object({
    group_by: z
      .enum(['method', 'year', 'facility'])
      .optional()
      .describe(
        'Dimension to aggregate by: "method" (discovery method counts), "year" (annual discoveries), or "facility" (telescope/observatory counts). Default: method',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of groups to return (default 50, max 100)'),
  })
  .strip();

export const nasaexoplanetSchemas: Record<string, ZodSchema> = {
  'nasaexoplanet.search': search,
  'nasaexoplanet.planet_detail': planetDetail,
  'nasaexoplanet.habitable': habitable,
  'nasaexoplanet.stats': stats,
};
