import { z } from 'zod';

const commonFilters = {
  country: z
    .string()
    .optional()
    .describe(
      'Filter by country name (partial match, e.g. "Kenya", "United States", "Brazil"). Case-insensitive.',
    ),
  city: z
    .string()
    .optional()
    .describe(
      'Filter by city name (partial match, e.g. "Nairobi", "Lagos", "Mumbai"). Case-insensitive.',
    ),
  region: z
    .string()
    .optional()
    .describe(
      'Filter by UN-Habitat region (partial match). Regions include "Sub-Saharan Africa", "Northern America and Europe", "Eastern and South-Eastern Asia", "Central and Southern Asia", "Latin America and the Caribbean", "Northern Africa and Western Asia", "Oceania".',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .describe('Maximum number of cities to return (1–100, default 50).'),
};

export const unhabitatSchemas: Record<string, z.ZodTypeAny> = {
  'unhabitat.transport_access': z
    .object({
      ...commonFilters,
    })
    .strip()
    .describe(
      'Query SDG 11.2.1 data: proportion of urban population with convenient access to public transport. ' +
        'Data covers 1,555 city records across all world regions. Use country/city/region filters to narrow results.',
    ),

  'unhabitat.land_consumption': z
    .object({
      ...commonFilters,
    })
    .strip()
    .describe(
      'Query SDG 11.3.1 data: land consumption rate (LCR) vs population growth rate (PGR) ratio per city. ' +
        'A ratio > 1 means land is being consumed faster than population growth (urban sprawl). ' +
        '581 city records with data for 1990–2000 and 2000–2015 periods.',
    ),

  'unhabitat.open_spaces': z
    .object({
      ...commonFilters,
    })
    .strip()
    .describe(
      'Query SDG 11.7.1 data: share of built-up urban area allocated to open public spaces (parks, plazas) ' +
        'and streets. 621 city records as of 2020 measurement year.',
    ),

  'unhabitat.city_budget': z
    .object({
      ...commonFilters,
    })
    .strip()
    .describe(
      'Query the UN-Habitat Global Municipal Database: city-level budget and expenditure breakdown ' +
        'across education, health, transport, water, energy, sanitation, and more. ' +
        '1,207 cities from all income groups with per-capita budget and capital expenditure data.',
    ),
};
