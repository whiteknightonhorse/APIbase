import { z } from 'zod';
import type { ZodSchema } from 'zod';

export const rorSchemas: Record<string, ZodSchema> = {
  'ror.search': z
    .object({
      query: z
        .string()
        .min(1)
        .describe(
          'Keyword query to search research organizations by name, acronym, alias, or domain ' +
            '(e.g. "MIT", "Stanford University", "CERN").',
        ),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          'Page number for pagination (1-indexed, default 1). Each page returns up to 20 results.',
        ),
      all_status: z
        .boolean()
        .optional()
        .describe(
          'When true, include inactive and withdrawn organizations in results. ' +
            'By default only active organizations are returned.',
        ),
    })
    .strip(),

  'ror.get': z
    .object({
      ror_id: z
        .string()
        .min(1)
        .describe(
          'ROR identifier for the organization. Accepts the full URL format ' +
            '(e.g. "https://ror.org/042nb2s44") or the short alphanumeric ID (e.g. "042nb2s44").',
        ),
    })
    .strip(),

  'ror.filter': z
    .object({
      types: z
        .string()
        .optional()
        .describe(
          'Filter by organization type. Valid values: Education, Healthcare, Company, Archive, ' +
            'Nonprofit, Government, Facility, Funder, Other ' +
            '(e.g. "Education" returns universities and research institutes).',
        ),
      country_code: z
        .string()
        .length(2)
        .optional()
        .describe(
          'ISO 3166-1 alpha-2 country code to filter organizations by country ' +
            '(e.g. "US", "DE", "GB", "JP").',
        ),
      status: z
        .string()
        .optional()
        .describe(
          'Organization status filter. Valid values: active (default), inactive, withdrawn. ' +
            'Use "inactive" or "withdrawn" to include legacy records.',
        ),
      query: z
        .string()
        .optional()
        .describe(
          'Optional keyword query to narrow results within the filter. Combines with type/country/status filters.',
        ),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          'Page number for pagination (1-indexed, default 1). Each page returns up to 20 results.',
        ),
    })
    .strip(),

  'ror.affiliation': z
    .object({
      affiliation: z
        .string()
        .min(1)
        .describe(
          'Free-text affiliation string to match against the ROR registry, as it appears in an ' +
            'academic paper or grant record (e.g. "Dept. of Physics, Univ. of California, Berkeley, CA, USA"). ' +
            'ROR uses intelligent substring matching to identify the best candidate organizations. ' +
            'Returns each candidate with a confidence score (0–1) and a "chosen" flag.',
        ),
    })
    .strip(),
};
