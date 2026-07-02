import { z } from 'zod';

export const euParliamentSchemas: Record<string, z.ZodTypeAny> = {
  'eu_parliament.meps.list': z
    .object({
      parliamentary_term: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe(
          'Parliamentary term number (1–10). Omit for current term (10). Example: 10 for the 2024–2029 term.',
        ),
      country: z
        .string()
        .length(2)
        .optional()
        .describe(
          'Filter by EU member state using ISO 3166-1 alpha-2 code. Example: DE (Germany), FR (France), PL (Poland).',
        ),
      political_group: z
        .enum(['PPE', 'NI', 'S-D', 'VERTS-ALE', 'ECR', 'RENEW', 'THE-LEFT', 'ID'])
        .optional()
        .describe(
          'Filter by EP political group abbreviation. PPE=centre-right, S-D=social-democrat, RENEW=liberal, VERTS-ALE=green, ECR=conservative, THE-LEFT=far-left, ID=far-right, NI=non-attached.',
        ),
      gender: z
        .enum(['MALE', 'FEMALE'])
        .optional()
        .describe('Filter MEPs by gender (MALE or FEMALE).'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Number of MEPs to return (1–100, default 50).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Number of results to skip for pagination (default 0).'),
    })
    .strip(),

  'eu_parliament.meps.details': z
    .object({
      mep_id: z
        .string()
        .describe(
          'Numeric MEP identifier from the European Parliament CODICT system. Example: 197539 for Mikuláš Peksa. Obtain IDs via the meps.list tool.',
        ),
    })
    .strip(),

  'eu_parliament.legislation.adopted_texts': z
    .object({
      parliamentary_term: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe(
          'Filter by parliamentary term (1–10). Example: 10 for texts adopted in the 2024–2029 term.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Number of adopted texts to return (1–100, default 20).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Number of results to skip for pagination (default 0).'),
    })
    .strip(),

  'eu_parliament.legislation.procedures': z
    .object({
      parliamentary_term: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe(
          'Filter by parliamentary term (1–10). Example: 10 for the 2024–2029 term procedures.',
        ),
      procedure_type: z
        .enum(['COD', 'CNS', 'BUD', 'INI', 'RSP', 'REG', 'DEC', 'DIR'])
        .optional()
        .describe(
          'Filter by procedure type. COD=ordinary legislative, CNS=consultation, BUD=budgetary, INI=own-initiative, RSP=resolution.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Number of procedures to return (1–100, default 20).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Number of results to skip for pagination (default 0).'),
    })
    .strip(),
};
