import { z } from 'zod';

export const btsTransportSchemas: Record<string, z.ZodTypeAny> = {
  'bts.border_crossings': z
    .object({
      border: z
        .enum(['US-Canada Border', 'US-Mexico Border'])
        .optional()
        .describe(
          'Filter by border: "US-Canada Border" or "US-Mexico Border". Omit for both borders.',
        ),
      measure: z
        .enum([
          'Buses',
          'Bus Passengers',
          'Pedestrians',
          'Personal Vehicle Passengers',
          'Personal Vehicles',
          'Train Passengers',
          'Trains',
          'Trucks',
        ])
        .optional()
        .describe(
          'Type of crossing to count. Options: Buses, Bus Passengers, Pedestrians, Personal Vehicle Passengers, Personal Vehicles, Train Passengers, Trains, Trucks.',
        ),
      port_name: z
        .string()
        .optional()
        .describe('Filter by port name (partial match, e.g. "San Diego", "El Paso", "Detroit").'),
      start_date: z
        .string()
        .optional()
        .describe('Start of date range in YYYY-MM-DD format (e.g. "2025-01-01").'),
      end_date: z
        .string()
        .optional()
        .describe('End of date range in YYYY-MM-DD format (e.g. "2025-12-31").'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('Maximum number of records to return (1–500, default 20).'),
    })
    .strip(),

  'bts.tsi': z
    .object({
      start_date: z
        .string()
        .optional()
        .describe(
          'Start of date range in YYYY-MM-DD format (e.g. "2024-01-01"). Index goes back to 2000.',
        ),
      end_date: z
        .string()
        .optional()
        .describe('End of date range in YYYY-MM-DD format (e.g. "2024-12-31").'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(300)
        .optional()
        .describe('Maximum number of monthly records to return (1–300, default 12).'),
    })
    .strip(),

  'bts.freight_indicators': z
    .object({
      indicator: z
        .string()
        .optional()
        .describe(
          'Partial name of the indicator to filter by (e.g. "Freight Transportation Services Index", "Containerized Imports", "Railroad", "Truck Speed"). Case-insensitive substring match.',
        ),
      year: z
        .number()
        .int()
        .min(2019)
        .max(2030)
        .optional()
        .describe('Filter by year (e.g. 2024). Data available from 2019.'),
      start_date: z
        .string()
        .optional()
        .describe('Start of date range in YYYY-MM-DD format (e.g. "2024-01-01").'),
      end_date: z
        .string()
        .optional()
        .describe('End of date range in YYYY-MM-DD format (e.g. "2024-12-31").'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('Maximum number of indicator records to return (1–500, default 20).'),
    })
    .strip(),

  'bts.aviation_traffic': z
    .object({
      airport_code: z
        .string()
        .length(3)
        .toUpperCase()
        .optional()
        .describe(
          'IATA airport code to filter by (e.g. "ATL" for Atlanta, "JFK" for New York JFK, "LAX" for Los Angeles). Returns top airports if omitted.',
        ),
      year: z
        .string()
        .optional()
        .describe(
          'Year or period to filter by. Annual values use format "YYYY" (e.g. "2025"). Quarterly use "YYYYQn" (e.g. "2026M1-3" for Q1 2026). Latest available is 2026M1-3.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('Maximum number of airport traffic records to return (1–500, default 20).'),
    })
    .strip(),
};
