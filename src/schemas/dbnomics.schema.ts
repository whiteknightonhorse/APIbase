import { z } from 'zod';

export const dbnomicsSchemas: Record<string, z.ZodSchema> = {
  'dbnomics.providers': z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Number of providers to return (1–200, default 100)'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Pagination offset — number of providers to skip (default 0)'),
    })
    .strip(),

  'dbnomics.datasets': z
    .object({
      provider_code: z
        .string()
        .min(1)
        .describe(
          'DBnomics provider code (e.g. WB for World Bank, OECD, IMF, Eurostat, ECB). Use dbnomics.providers to list valid codes.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Number of datasets to return (1–200, default 50)'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Pagination offset — number of datasets to skip (default 0)'),
    })
    .strip(),

  'dbnomics.series': z
    .object({
      provider_code: z
        .string()
        .min(1)
        .describe(
          'DBnomics provider code (e.g. WB, OECD, IMF). Use dbnomics.providers to list codes.',
        ),
      dataset_code: z
        .string()
        .min(1)
        .describe(
          'Dataset code within the provider (e.g. WDI for World Development Indicators). Use dbnomics.datasets to list codes.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Number of series to return (1–200, default 50)'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Pagination offset — number of series to skip (default 0)'),
    })
    .strip(),

  'dbnomics.fetch_series': z
    .object({
      provider_code: z
        .string()
        .min(1)
        .describe(
          'DBnomics provider code (e.g. WB, OECD, IMF). Use dbnomics.providers to list codes.',
        ),
      dataset_code: z
        .string()
        .min(1)
        .describe(
          'Dataset code within the provider (e.g. WDI, QNA). Use dbnomics.datasets to list codes.',
        ),
      series_code: z
        .string()
        .min(1)
        .describe(
          'Series code within the dataset (e.g. A-US.NY.GDP.MKTP.CD for US annual nominal GDP in WB/WDI). Use dbnomics.series to browse available codes.',
        ),
      last_n_periods: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe(
          'Return only the last N observations (most recent). Omit to return the full history.',
        ),
    })
    .strip(),
};
