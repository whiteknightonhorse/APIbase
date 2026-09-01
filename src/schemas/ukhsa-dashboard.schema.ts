import { z, type ZodSchema } from 'zod';

const browse = z
  .object({
    theme: z
      .string()
      .optional()
      .describe(
        'Top-level theme slug (e.g. "infectious_disease", "immunisation", "medicines", ' +
          '"climate_and_environment"). Omit to list all themes.',
      ),
    sub_theme: z
      .string()
      .optional()
      .describe(
        'Sub-theme slug within the given theme (e.g. "respiratory", "vaccine_preventable"). ' +
          'Requires theme. Omit (with theme set) to list sub-themes.',
      ),
    topic: z
      .string()
      .optional()
      .describe(
        'Disease/topic slug within the given sub_theme (e.g. "COVID-19", "Influenza"). ' +
          'Requires theme and sub_theme. Omit to list topics.',
      ),
    geography_type: z
      .string()
      .optional()
      .describe(
        'Geography type within the given topic (e.g. "Nation", "UKHSA Region", ' +
          '"Upper Tier Local Authority"). Requires theme, sub_theme, and topic. Omit to list ' +
          'geography types.',
      ),
    geography: z
      .string()
      .optional()
      .describe(
        'Specific geography name within the given geography_type (e.g. "England", "London"). ' +
          'Requires theme, sub_theme, topic, and geography_type. Omit to list geographies.',
      ),
  })
  .strip();

const metricData = z
  .object({
    theme: z.string().min(1).describe('Top-level theme slug (e.g. "infectious_disease")'),
    sub_theme: z.string().min(1).describe('Sub-theme slug (e.g. "respiratory")'),
    topic: z.string().min(1).describe('Disease/topic slug (e.g. "COVID-19")'),
    geography_type: z.string().min(1).describe('Geography type (e.g. "Nation", "UKHSA Region")'),
    geography: z.string().min(1).describe('Geography name (e.g. "England")'),
    metric: z
      .string()
      .min(1)
      .describe(
        'Metric name from ukhsa-dashboard.browse at the metrics level ' +
          '(e.g. "COVID-19_cases_casesByDay")',
      ),
    year: z
      .number()
      .int()
      .min(2000)
      .max(2100)
      .optional()
      .describe('Filter to a single calendar year (e.g. 2023)'),
    epiweek: z
      .number()
      .int()
      .min(1)
      .max(53)
      .optional()
      .describe('Filter to a single epidemiological week number (1-53)'),
    date: z
      .string()
      .optional()
      .describe('Filter to a single exact date, YYYY-MM-DD (e.g. "2023-06-15")'),
    age: z
      .string()
      .optional()
      .describe('Filter by age band as published for this metric (e.g. "all", "15-44")'),
    sex: z
      .string()
      .optional()
      .describe('Filter by sex as published for this metric (e.g. "all", "f", "m")'),
    stratum: z
      .string()
      .optional()
      .describe('Filter by stratum/breakdown as published for this metric (e.g. "default")'),
    in_reporting_delay_period: z
      .boolean()
      .optional()
      .describe('Filter to rows still within the provisional reporting-delay window'),
    page: z.number().int().min(1).optional().describe('Page number of results (default 1)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Number of data points per page (1-500, default 100)'),
  })
  .strip();

export const ukhsaDashboardSchemas: Record<string, ZodSchema> = {
  'ukhsa-dashboard.browse': browse,
  'ukhsa-dashboard.metric_data': metricData,
};
