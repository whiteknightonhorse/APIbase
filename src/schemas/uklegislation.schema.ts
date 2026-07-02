import { z } from 'zod';

const LEG_TYPES = [
  'ukpga',
  'uksi',
  'asp',
  'asc',
  'anaw',
  'nia',
  'ukdsi',
  'ukcm',
  'nisi',
  'ukla',
  'wsi',
  'ssi',
  'nisr',
] as const;

export const uklegislationSchemas: Record<string, z.ZodTypeAny> = {
  'ukleg.legislation.search': z
    .object({
      title: z
        .string()
        .optional()
        .describe(
          'Search term for the legislation title (e.g. "climate change", "data protection", "companies"). ' +
            'At least one of title, year, or type should be provided.',
        ),
      type: z
        .enum(LEG_TYPES)
        .optional()
        .describe(
          'Legislation type code. Common values: ukpga (UK Public General Acts), uksi (UK Statutory Instruments), ' +
            'asp (Scottish Parliament Acts), asc (Acts of Senedd Cymru/Wales), nia (Northern Ireland Assembly Acts). ' +
            'Omit to search all types.',
        ),
      year: z
        .number()
        .int()
        .min(1267)
        .max(2030)
        .optional()
        .describe(
          'Year the legislation was enacted (e.g. 2008, 2018). Supports years from 1267 to present.',
        ),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Page number for pagination (default 1, 20 results per page).'),
    })
    .strip(),

  'ukleg.legislation.details': z
    .object({
      type: z
        .enum(LEG_TYPES)
        .describe(
          'Legislation type code. Common values: ukpga (UK Public General Acts), uksi (UK Statutory Instruments), ' +
            'asp (Scottish Parliament Acts), asc (Senedd Cymru/Wales Acts), nia (Northern Ireland Acts). ' +
            'Example: ukpga for the Climate Change Act 2008.',
        ),
      year: z
        .number()
        .int()
        .min(1267)
        .max(2030)
        .describe('Year the legislation was enacted (e.g. 2008 for Climate Change Act 2008).'),
      number: z
        .number()
        .int()
        .min(1)
        .describe(
          'Chapter or instrument number of the legislation within the year (e.g. 27 for Climate Change Act 2008 c.27).',
        ),
    })
    .strip(),

  'ukleg.legislation.sections': z
    .object({
      type: z
        .enum(LEG_TYPES)
        .describe(
          'Legislation type code. Common values: ukpga (UK Public General Acts), uksi (UK Statutory Instruments), ' +
            'asp (Scottish Parliament Acts), asc (Senedd Cymru/Wales Acts), nia (Northern Ireland Acts).',
        ),
      year: z
        .number()
        .int()
        .min(1267)
        .max(2030)
        .describe('Year the legislation was enacted (e.g. 2023 for legislation passed in 2023).'),
      number: z
        .number()
        .int()
        .min(1)
        .describe(
          'Chapter or instrument number within the year (e.g. 55 for the Online Safety Act 2023 c.55).',
        ),
    })
    .strip(),

  'ukleg.legislation.recent': z
    .object({
      type: z
        .enum([...LEG_TYPES, 'primary', 'secondary', 'any'])
        .optional()
        .describe(
          'Filter by legislation category. Use primary for all primary legislation (Acts), secondary for all Statutory Instruments, ' +
            'or a specific code like ukpga, uksi, asp. Omit or use any for all types.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Number of recent legislation items to return (1–20, default 10).'),
    })
    .strip(),
};
