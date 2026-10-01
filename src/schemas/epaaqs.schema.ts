import { z, type ZodSchema } from 'zod';

const state = z
  .string()
  .regex(/^\d{2}$/)
  .describe('2-digit state FIPS code (e.g. "06" California, "36" New York)');

const county = z
  .string()
  .regex(/^\d{3}$/)
  .describe('3-digit county FIPS code (e.g. "037" Los Angeles County; see epa-aqs.list_counties)');

const parameterCodes = z
  .string()
  .regex(/^\d{5}(,\d{5}){0,4}$/)
  .describe(
    'AQS parameter code(s), comma-separated, max 5 (e.g. "88101" PM2.5, "44201" ozone, "42101" CO; see epa-aqs.list_parameters)',
  );

const date = (label: string) =>
  z
    .string()
    .regex(/^\d{8}$/)
    .describe(`${label} as YYYYMMDD (e.g. "20240101")`);

const maxRows = z
  .number()
  .int()
  .min(1)
  .max(1000)
  .optional()
  .describe('Maximum number of rows to return (1-1000, default 200)');

const countyQuery = {
  parameter_codes: parameterCodes,
  begin_date: date('Begin date'),
  end_date: date('End date (must be in the same calendar year as begin_date)'),
  state,
  county,
  max_rows: maxRows,
};

const listParameters = z
  .object({
    parameter_class: z
      .enum([
        'ALL',
        'AQI POLLUTANTS',
        'CRITERIA',
        'FORECAST',
        'HAPS',
        'MET',
        'NATTS',
        'PAMS',
        'SPECIATION',
      ])
      .optional()
      .describe('Parameter class to list (default CRITERIA)'),
  })
  .strip();

const listCounties = z.object({ state }).strip();

const monitors = z.object(countyQuery).strip();
const dailyData = z.object(countyQuery).strip();
const annualData = z.object(countyQuery).strip();

export const epaaqsSchemas: Record<string, ZodSchema> = {
  'epa-aqs.list_parameters': listParameters,
  'epa-aqs.list_counties': listCounties,
  'epa-aqs.monitors': monitors,
  'epa-aqs.daily_data': dailyData,
  'epa-aqs.annual_data': annualData,
};
