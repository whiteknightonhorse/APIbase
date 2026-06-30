import { z } from 'zod';

// --- Shared ---
const yearParam = (min: number, max: number, label: string) =>
  z.number().int().min(min).max(max).optional().describe(label);

// IRENA capacity technology names (Country-level table)
const CAP_COUNTRY_TECHS = [
  'Total renewable energy',
  'Solar energy',
  'Solar photovoltaic',
  'Solar thermal energy',
  'Wind energy',
  'Onshore wind energy',
  'Offshore wind energy',
  'Renewable hydropower',
  'Mixed hydropower',
  'Marine energy',
  'Bioenergy',
  'Solid biofuels',
  'Liquid biofuels',
  'Gas biofuels',
  'Renewable waste',
  'Geothermal energy',
  'Total non-renewable energy',
  'Fossil fuels',
  'Coal',
  'Oil',
  'Natural gas',
  'Nuclear energy',
  'Non-renewable waste',
  'Pumped hydro',
] as const;

// IRENA generation technology names (Country-level table)
const GEN_COUNTRY_TECHS = [
  'Total renewable',
  'Solar photovoltaic',
  'Solar thermal energy',
  'Onshore wind energy',
  'Offshore wind energy',
  'Renewable hydropower',
  'Mixed Hydro Plants',
  'Marine energy',
  'Solid biofuels',
  'Liquid biofuels',
  'Biogas',
  'Renewable municipal waste',
  'Geothermal energy',
  'Total non-renewable',
  'Coal and peat',
  'Oil',
  'Natural gas',
  'Nuclear',
  'Pumped storage',
] as const;

// IRENA capacity technology names (Region-level table)
const CAP_REGION_TECHS = [
  'Total renewable energy',
  'Solar energy',
  'Wind energy',
  'Renewable hydropower',
  'Pumped hydro',
  'Marine energy',
  'Bioenergy',
  'Geothermal energy',
  'Total non-renewable energy',
  'Fossil fuels',
  'Nuclear energy',
  'Other non-renewable energy',
] as const;

export const irenaSchemas: Record<string, z.ZodSchema> = {
  'irena.capacity_country': z
    .object({
      country: z
        .string()
        .length(3)
        .describe(
          'ISO 3166-1 alpha-3 country code (e.g. USA, DEU, CHN, IND, BRA). Must be exactly 3 letters.',
        ),
      technology: z
        .enum(CAP_COUNTRY_TECHS)
        .optional()
        .describe(
          'Energy technology to query. Default: "Total renewable energy". Renewable options: Total renewable energy, Solar energy, Solar photovoltaic, Wind energy, Onshore wind energy, Offshore wind energy, Renewable hydropower, Bioenergy, Geothermal energy.',
        ),
      year_from: yearParam(2000, 2025, 'Start year (inclusive, 2000–2025). Default: 2020.'),
      year_to: yearParam(
        2000,
        2025,
        'End year (inclusive, 2000–2025, must be ≥ year_from). Default: 2025.',
      ),
      grid_connection: z
        .enum(['OnGrid', 'OffGrid'])
        .optional()
        .describe('Grid connection type. Default: "OnGrid".'),
    })
    .strip(),

  'irena.generation_country': z
    .object({
      country: z
        .string()
        .length(3)
        .describe(
          'ISO 3166-1 alpha-3 country code (e.g. USA, DEU, CHN, IND, BRA). Must be exactly 3 letters.',
        ),
      technology: z
        .enum(GEN_COUNTRY_TECHS)
        .optional()
        .describe(
          'Energy technology to query. Default: "Total renewable". Options: Total renewable, Solar photovoltaic, Onshore wind energy, Offshore wind energy, Renewable hydropower, Bioenergy subcategories, Geothermal energy, Total non-renewable, etc.',
        ),
      year_from: yearParam(2000, 2024, 'Start year (inclusive, 2000–2024). Default: 2020.'),
      year_to: yearParam(
        2000,
        2024,
        'End year (inclusive, 2000–2024, must be ≥ year_from). Default: 2024.',
      ),
      grid_connection: z
        .enum(['OnGrid', 'OffGrid', 'All'])
        .optional()
        .describe('Grid connection type. Default: "OnGrid".'),
    })
    .strip(),

  'irena.capacity_region': z
    .object({
      region: z
        .enum([
          'World',
          'Africa',
          'Asia',
          'Central America and the Caribbean',
          'Eurasia',
          'Europe',
          'Middle East',
          'North America',
          'Oceania',
          'South America',
        ])
        .describe(
          'IRENA world region. One of: World, Africa, Asia, Central America and the Caribbean, Eurasia, Europe, Middle East, North America, Oceania, South America.',
        ),
      technology: z
        .enum(CAP_REGION_TECHS)
        .optional()
        .describe(
          'Energy technology to query. Default: "Total renewable energy". Options: Total renewable energy, Solar energy, Wind energy, Renewable hydropower, Pumped hydro, Marine energy, Bioenergy, Geothermal energy, Total non-renewable energy, Fossil fuels, Nuclear energy, Other non-renewable energy.',
        ),
      year_from: yearParam(2000, 2025, 'Start year (inclusive, 2000–2025). Default: 2020.'),
      year_to: yearParam(
        2000,
        2025,
        'End year (inclusive, 2000–2025, must be ≥ year_from). Default: 2025.',
      ),
      grid_connection: z
        .enum(['OnGrid', 'OffGrid'])
        .optional()
        .describe('Grid connection type. Default: "OnGrid".'),
    })
    .strip(),

  'irena.share_renewables': z
    .object({
      country_or_region: z
        .string()
        .describe(
          'ISO 3166-1 alpha-3 country code (e.g. USA, DEU, CHN) OR IRENA region name (e.g. World, Europe, Asia, Africa, North America, South America, Middle East, Eurasia, Oceania, Central America and the Caribbean). Default: "World".',
        ),
      indicator: z
        .enum(['generation', 'capacity'])
        .optional()
        .describe(
          'Whether to return RE share of electricity generation or capacity. Default: "generation".',
        ),
      year_from: yearParam(2000, 2025, 'Start year (inclusive, 2000–2025). Default: 2020.'),
      year_to: yearParam(
        2000,
        2025,
        'End year (inclusive, 2000–2025, must be ≥ year_from). Default: 2025.',
      ),
    })
    .strip(),
};
