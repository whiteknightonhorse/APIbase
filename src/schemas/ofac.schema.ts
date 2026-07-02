import { z, type ZodSchema } from 'zod';

const sdnSearch = z
  .object({
    name: z
      .string()
      .min(1)
      .max(200)
      .describe(
        'Name to search for in the OFAC SDN list (case-insensitive substring match). ' +
          'Examples: "GAZPROM", "Vladimir Putin", "Bank Melli Iran". ' +
          'Use the most distinctive part of the name for best results.',
      ),
    type: z
      .enum(['individual', 'entity', 'vessel', 'aircraft'])
      .optional()
      .describe(
        'Filter by SDN entity type. "individual" = natural persons, "entity" = companies/organisations, ' +
          '"vessel" = ships, "aircraft" = aircraft. Omit to search all types.',
      ),
    program: z
      .string()
      .max(50)
      .optional()
      .describe(
        'Filter by OFAC sanctions program code (uppercase). Examples: "IRAN", "RUSSIA", "CUBA", "SDN", ' +
          '"DPRK", "CYBER", "UKRAINE-EO13685". Use ofac.meta.programs to see the full list of codes.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of matches to return (default 20, max 50).'),
  })
  .strip();

const sdnAliases = z
  .object({
    ent_num: z
      .number()
      .int()
      .positive()
      .describe(
        'OFAC entity number (ent_num) of the SDN entry to look up aliases for. ' +
          'Obtain this from ofac.sdn.search results (the "ent_num" field on each match).',
      ),
  })
  .strip();

const programs = z
  .object({
    locale: z
      .string()
      .optional()
      .describe(
        'No-op — included for consistency. Response is always in English as published by US Treasury.',
      ),
  })
  .strip();

const publicationInfo = z
  .object({
    locale: z
      .string()
      .optional()
      .describe(
        'No-op — included for consistency. Response is always in English as published by US Treasury.',
      ),
  })
  .strip();

export const ofacSchemas: Record<string, ZodSchema> = {
  'ofac.sdn.search': sdnSearch,
  'ofac.sdn.aliases': sdnAliases,
  'ofac.meta.programs': programs,
  'ofac.meta.publication_info': publicationInfo,
};
