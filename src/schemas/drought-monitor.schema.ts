import { z, type ZodSchema } from 'zod';

const nationalStats = z
  .object({
    start_date: z
      .string()
      .describe(
        'Start date for the query range in YYYY-MM-DD format (e.g. "2024-01-01"). USDM publishes weekly on Tuesdays; dates snap to the nearest release.',
      ),
    end_date: z
      .string()
      .describe(
        'End date for the query range in YYYY-MM-DD format (e.g. "2024-01-08"). Maximum range is 1 year from start_date.',
      ),
    metric: z
      .enum(['area', 'percent'])
      .optional()
      .describe(
        'Measurement unit: "area" returns drought coverage in square miles (default); "percent" returns drought coverage as a percentage of total US land area.',
      ),
    statistics_type: z
      .enum(['cumulative', 'categorical'])
      .optional()
      .describe(
        'How drought levels are counted: "cumulative" (default) means each D-level includes worse levels (D1 includes D1+D2+D3+D4); "categorical" means each level is non-overlapping and mutually exclusive.',
      ),
  })
  .strip();

const dsci = z
  .object({
    start_date: z
      .string()
      .describe(
        'Start date for the query range in YYYY-MM-DD format (e.g. "2024-01-01"). USDM publishes weekly on Tuesdays; dates snap to the nearest release.',
      ),
    end_date: z
      .string()
      .describe(
        'End date for the query range in YYYY-MM-DD format (e.g. "2024-01-08"). Maximum range is 1 year from start_date.',
      ),
  })
  .strip();

const countyStats = z
  .object({
    aoi: z
      .string()
      .describe(
        'Area of interest: either a 5-digit county FIPS code (e.g. "48113" for Dallas County TX, "06037" for Los Angeles County CA) or a 2-letter state abbreviation to get all counties in a state (e.g. "TX", "CA", "NE").',
      ),
    start_date: z
      .string()
      .describe(
        'Start date for the query range in YYYY-MM-DD format (e.g. "2022-08-01"). USDM publishes weekly on Tuesdays; dates snap to the nearest release.',
      ),
    end_date: z
      .string()
      .describe(
        'End date for the query range in YYYY-MM-DD format (e.g. "2022-08-14"). Maximum range is 1 year from start_date.',
      ),
    statistics_type: z
      .enum(['cumulative', 'categorical'])
      .optional()
      .describe(
        'How drought levels are counted: "cumulative" (default) means each D-level includes worse levels; "categorical" means each level is non-overlapping and mutually exclusive.',
      ),
  })
  .strip();

const weeksInDrought = z
  .object({
    drought_level: z
      .number()
      .int()
      .min(0)
      .max(4)
      .describe(
        'Minimum drought severity level to count: 0=D0 Abnormally Dry, 1=D1 Moderate Drought, 2=D2 Severe Drought, 3=D3 Extreme Drought, 4=D4 Exceptional Drought.',
      ),
    min_weeks: z
      .number()
      .int()
      .min(1)
      .describe(
        'Minimum number of weeks that a county must have been at or above the drought_level threshold to be included in results (e.g. 4 for counties with at least 4 weeks of drought).',
      ),
    start_date: z
      .string()
      .describe(
        'Start date for the analysis period in YYYY-MM-DD format (e.g. "2022-01-01"). Maximum range is 1 year from start_date.',
      ),
    end_date: z
      .string()
      .describe(
        'End date for the analysis period in YYYY-MM-DD format (e.g. "2023-01-01"). Maximum range is 1 year from start_date.',
      ),
    state: z
      .string()
      .optional()
      .describe(
        'Two-letter US state abbreviation to filter results to one state (e.g. "NE", "TX", "CA"). Leave empty to return counties from all states.',
      ),
    consecutive: z
      .boolean()
      .optional()
      .describe(
        'If true, counts only consecutive weeks in drought; if false or omitted (default), counts all weeks (consecutive + non-consecutive) spent at or above the threshold.',
      ),
  })
  .strip();

export const droughtMonitorSchemas: Record<string, ZodSchema> = {
  'drought.national_stats': nationalStats,
  'drought.dsci': dsci,
  'drought.county_stats': countyStats,
  'drought.weeks_in_drought': weeksInDrought,
};
