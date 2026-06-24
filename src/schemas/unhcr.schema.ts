import { z } from 'zod';

// Shared params used by all UNHCR endpoints
const commonParams = {
  year: z
    .number()
    .int()
    .min(1951)
    .max(2030)
    .optional()
    .describe(
      'Reference year for the statistics (1951–present). Omit to return all years (paginated).',
    ),
  coo: z
    .string()
    .length(3)
    .optional()
    .describe(
      'ISO 3-letter country code for country of origin, e.g. SYR (Syria), AFG (Afghanistan), ' +
        'UKR (Ukraine). Omit to include all origin countries.',
    ),
  coa: z
    .string()
    .length(3)
    .optional()
    .describe(
      'ISO 3-letter country code for country of asylum, e.g. DEU (Germany), TUR (Turkey), ' +
        'COL (Colombia). Omit to include all asylum countries.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Number of records to return per page (1–100, default 10).'),
};

export const unhcrSchemas: Record<string, z.ZodTypeAny> = {
  'unhcr.population': z
    .object(commonParams)
    .strip()
    .describe(
      'UNHCR global or per-country refugee and displaced-person population statistics. ' +
        'Returns refugee counts, asylum seekers, IDPs, stateless persons, and host community figures by year.',
    ),

  'unhcr.solutions': z
    .object(commonParams)
    .strip()
    .describe(
      'UNHCR durable solutions data — voluntary returns, resettlement, and naturalization by year.',
    ),

  'unhcr.asylum_applications': z
    .object(commonParams)
    .strip()
    .describe(
      'UNHCR asylum application counts — number of new applications filed, broken down by ' +
        'procedure type, application type, and decision level.',
    ),

  'unhcr.asylum_decisions': z
    .object(commonParams)
    .strip()
    .describe(
      'UNHCR asylum decision outcomes — recognized refugees, other positive decisions, ' +
        'rejections, and closed cases by year and country.',
    ),
};
