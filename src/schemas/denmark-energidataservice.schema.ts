import { z, type ZodSchema } from 'zod';

const priceArea = z
  .string()
  .optional()
  .describe(
    'Bidding/price zone to filter by, e.g. "DK1" (West Denmark), "DK2" (East Denmark), or ' +
      'a connected zone such as "DE", "NO2", "SE3". Omit to return all zones.',
  );

const startDate = z
  .string()
  .optional()
  .describe(
    'Start of the time range, ISO 8601 (e.g. "2026-09-01" or "2026-09-01T00:00"). Omit for the most recent data.',
  );

const endDate = z
  .string()
  .optional()
  .describe('End of the time range, ISO 8601 (e.g. "2026-09-02"). Omit for the most recent data.');

const spotPrices = z
  .object({
    price_area: priceArea,
    start_date: startDate,
    end_date: endDate,
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Maximum number of hourly price points to return (1-200, default 24)'),
  })
  .strip();

const co2Emissions = z
  .object({
    price_area: priceArea,
    start_date: startDate,
    end_date: endDate,
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Maximum number of 5-minute CO2 readings to return (1-200, default 24)'),
  })
  .strip();

const productionConsumption = z
  .object({
    price_area: priceArea,
    start_date: startDate,
    end_date: endDate,
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe(
        'Maximum number of hourly production/consumption records to return (1-200, default 24)',
      ),
  })
  .strip();

export const denmarkEnergidataserviceSchemas: Record<string, ZodSchema> = {
  'denmark-energidataservice.spot_prices': spotPrices,
  'denmark-energidataservice.co2_emissions': co2Emissions,
  'denmark-energidataservice.production_consumption': productionConsumption,
};
