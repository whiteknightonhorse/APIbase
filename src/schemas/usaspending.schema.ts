import { z, type ZodSchema } from 'zod';

const awards = z
  .object({
    keyword: z
      .string()
      .min(1)
      .describe(
        'Search keyword for federal awards (e.g. "artificial intelligence", "cybersecurity", company name)',
      ),
    fiscal_year: z
      .number()
      .int()
      .min(2000)
      .max(2026)
      .optional()
      .describe('Fiscal year to filter (e.g. 2025). Default: current year.'),
    award_type: z
      .enum(['contracts', 'grants', 'all'])
      .optional()
      .describe('Filter by award type: contracts, grants, or all (default: all)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of results to return (1-25, default 10)'),
  })
  .strip();

const agency = z
  .object({
    agency_name: z
      .string()
      .min(1)
      .describe(
        'Federal agency name or keyword (e.g. "Defense", "NASA", "Health and Human Services")',
      ),
    fiscal_year: z
      .number()
      .int()
      .min(2000)
      .max(2026)
      .optional()
      .describe('Fiscal year (e.g. 2025). Default: current year.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of top awards to return (1-25, default 10)'),
  })
  .strip();

const geography = z
  .object({
    fiscal_year: z
      .number()
      .int()
      .min(2017)
      .max(2026)
      .optional()
      .describe('Fiscal year (e.g. 2025). Default: current year.'),
    award_type: z
      .enum(['contracts', 'grants', 'all'])
      .optional()
      .describe('Filter by award type: contracts, grants, or all (default: all)'),
  })
  .strip();

export const usaspendingSchemas: Record<string, ZodSchema> = {
  'spending.awards': awards,
  'spending.agency': agency,
  'spending.geography': geography,
};
