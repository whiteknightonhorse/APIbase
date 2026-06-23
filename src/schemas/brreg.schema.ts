import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    name: z
      .string()
      .optional()
      .describe(
        'Company name or partial name to search (e.g. "Equinor", "Telenor", "DNB"). ' +
          'Case-insensitive. At least one filter (name, municipality_number, org_form, nace_code) is recommended.',
      ),
    municipality_number: z
      .string()
      .length(4)
      .optional()
      .describe(
        'Norwegian municipality number (4-digit code, e.g. "0301" for Oslo, "1103" for Stavanger). ' +
          'Restricts results to companies registered in that municipality.',
      ),
    org_form: z
      .enum([
        'AS',
        'ASA',
        'ENK',
        'ANS',
        'DA',
        'NUF',
        'BA',
        'SA',
        'STI',
        'FLI',
        'BO',
        'BRL',
        'ESEK',
        'GFS',
        'IKJP',
        'IKS',
        'KBO',
        'KF',
        'KFFK',
        'KS',
        'NP',
        'OPMV',
        'ORG',
        'PERS',
        'PK',
        'PRE',
        'SF',
        'SPA',
        'STAT',
        'SÆR',
        'TVAM',
        'VPFO',
      ])
      .optional()
      .describe(
        'Organization form code to filter by. Common values: AS=Private Limited Company, ' +
          'ASA=Public Limited Company, ENK=Sole Proprietorship, NUF=Foreign Entity Norwegian Branch, ' +
          'BA/SA=Cooperative, STI=Foundation, FLI=Non-Profit Association.',
      ),
    nace_code: z
      .string()
      .optional()
      .describe(
        'NACE industry code to filter by (e.g. "06.100" for Extraction of crude oil, ' +
          '"47.110" for Retail in non-specialised stores, "62.010" for Computer programming). ' +
          'Matches primary industry code (naeringskode1).',
      ),
    size: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of results per page (1–20, default 5).'),
    page: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Zero-based page number for pagination (default 0).'),
  })
  .strip();

const entity = z
  .object({
    org_number: z
      .string()
      .regex(/^\d{9}$/)
      .describe(
        'Norwegian organisation number — exactly 9 digits (e.g. "923609016" for Equinor, ' +
          '"982463718" for DNB). No spaces or dashes.',
      ),
  })
  .strip();

const subUnits = z
  .object({
    org_number: z
      .string()
      .regex(/^\d{9}$/)
      .describe(
        'Organisation number of the parent company (9 digits). Returns all registered ' +
          'sub-units (branches, departments, locations) that belong to this parent entity.',
      ),
    size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of sub-units per page (1–50, default 10).'),
    page: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Zero-based page number for pagination (default 0).'),
  })
  .strip();

const roles = z
  .object({
    org_number: z
      .string()
      .regex(/^\d{9}$/)
      .describe(
        'Organisation number of the company to retrieve roles for (9 digits). ' +
          'Returns all registered role groups including board of directors (STYR), ' +
          'CEO (DAGL), auditor (REVI), and other statutory positions.',
      ),
  })
  .strip();

export const brregSchemas: Record<string, ZodSchema> = {
  'brreg.search': search,
  'brreg.entity': entity,
  'brreg.sub_units': subUnits,
  'brreg.roles': roles,
};
