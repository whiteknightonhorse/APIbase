import { z } from 'zod';
import type { ZodSchema } from 'zod';

/**
 * NREL (National Renewable Energy Laboratory) tool schemas (UC-414).
 *
 * Covers AFDC (Alternative Fuels Station Locator) and PVWatts (Solar PV estimator).
 * All fields include .describe() per Smithery quality requirements.
 */
export const nrelSchemas: Record<string, ZodSchema> = {
  'nrel.afdc_stations_nearest': z
    .object({
      latitude: z
        .number()
        .describe('WGS84 latitude (US territory only). Example: 37.7749 for San Francisco.'),
      longitude: z
        .number()
        .describe('WGS84 longitude (US territory only). Example: -122.4194 for San Francisco.'),
      fuel_type: z
        .string()
        .optional()
        .default('ELEC')
        .describe(
          'Comma-separated fuel codes: ELEC (electric), CNG, LNG, LPG (propane), BD (biodiesel), E85, HY (hydrogen). Default ELEC.',
        ),
      status: z
        .enum(['E', 'P', 'T'])
        .optional()
        .default('E')
        .describe(
          'Station status: E=available (open), P=planned (future), T=temporarily unavailable. Default E.',
        ),
      radius: z
        .number()
        .optional()
        .default(5)
        .describe('Search radius in miles (max 500). Default 5.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(20)
        .describe('Max stations to return (1-200). Default 20.'),
    })
    .strip(),

  'nrel.afdc_stations_search': z
    .object({
      zip: z
        .string()
        .optional()
        .describe("5-digit US ZIP code to search within. Example: '94102'."),
      state: z.string().optional().describe("2-letter US state code. Example: 'CA', 'TX', 'NY'."),
      city: z
        .string()
        .optional()
        .describe('City name. Use with state for disambiguation. Example: Oakland.'),
      fuel_type: z
        .string()
        .optional()
        .default('ELEC')
        .describe(
          'Comma-separated fuel codes: ELEC (electric), CNG, LNG, LPG (propane), BD (biodiesel), E85, HY (hydrogen). Default ELEC.',
        ),
      ev_connector_type: z
        .string()
        .optional()
        .describe(
          'EV connector codes (comma-separated): J1772 (Level 2), J1772COMBO (CCS), CHADEMO, TESLA, NEMA1450, NEMA515.',
        ),
      access: z
        .enum(['public', 'private'])
        .optional()
        .describe(
          "Filter by access type: 'public' for open-access stations, 'private' for fleet-only.",
        ),
      status: z
        .enum(['E', 'P', 'T'])
        .optional()
        .default('E')
        .describe(
          'Station status: E=available (open), P=planned (future), T=temporarily unavailable. Default E.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(50)
        .describe('Results per page (1-200). Default 50.'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe('Pagination offset — number of results to skip. Default 0.'),
    })
    .strip(),

  'nrel.afdc_station_detail': z
    .object({
      station_id: z
        .number()
        .int()
        .positive()
        .describe(
          'AFDC station ID (positive integer). Obtained from afdc_stations_nearest or afdc_stations_search results.',
        ),
    })
    .strip(),

  'nrel.pvwatts_estimate': z
    .object({
      latitude: z
        .number()
        .describe(
          'Site latitude in decimal degrees (global, WGS84). Example: 37.7749 (San Francisco), 51.5074 (London).',
        ),
      longitude: z
        .number()
        .describe(
          'Site longitude in decimal degrees (global, WGS84). Example: -122.4194 (San Francisco), -0.1278 (London).',
        ),
      system_capacity: z
        .number()
        .positive()
        .describe(
          'System DC nameplate capacity in kilowatts (kW). Example: 5 for a typical residential system, 100 for commercial.',
        ),
      module_type: z
        .number()
        .int()
        .min(0)
        .max(2)
        .optional()
        .default(1)
        .describe(
          'Solar module type: 0=Standard (polycrystalline), 1=Premium (monocrystalline, default), 2=Thin Film.',
        ),
      losses: z
        .number()
        .min(0)
        .max(99)
        .optional()
        .default(14)
        .describe(
          'System losses percentage (0-99). Accounts for wiring, soiling, shading. Default 14 (NREL recommended).',
        ),
      array_type: z
        .number()
        .int()
        .min(0)
        .max(4)
        .optional()
        .default(1)
        .describe(
          'Array mount type: 0=Fixed open rack, 1=Fixed roof mount (default), 2=1-axis tracking, 3=1-axis backtracking, 4=2-axis tracking.',
        ),
      tilt: z
        .number()
        .min(0)
        .max(90)
        .optional()
        .default(20)
        .describe(
          'Module tilt angle in degrees from horizontal (0=flat/horizontal, 90=vertical). Default 20.',
        ),
      azimuth: z
        .number()
        .min(0)
        .max(360)
        .optional()
        .default(180)
        .describe(
          'Array azimuth angle: 0=north, 90=east, 180=south (default, optimal in Northern Hemisphere), 270=west.',
        ),
    })
    .strip(),
};
