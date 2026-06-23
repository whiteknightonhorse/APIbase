import { z, type ZodSchema } from 'zod';

const literatureSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Keyword to search for — matches title, author, subject, and publisher fields (e.g. "Darwin birds Galapagos")',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results per page (1–50, default 10)'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1)'),
  })
  .strip();

const literatureFulltext = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Term or phrase to search within the digitized full text of BHL publications (e.g. "symbiosis nitrogen fixation")',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results per page (1–50, default 10)'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1)'),
  })
  .strip();

const taxonomyNameSearch = z
  .object({
    name: z
      .string()
      .min(1)
      .describe(
        'Scientific name to look up in BHL — full or partial Latin binomial (e.g. "Quercus robur", "Homo sapiens")',
      ),
  })
  .strip();

const literatureBySubject = z
  .object({
    subject: z
      .string()
      .min(1)
      .describe(
        'Subject keyword used in BHL classification (e.g. "ornithology", "botany", "entomology")',
      ),
  })
  .strip();

export const bhlSchemas: Record<string, ZodSchema> = {
  'bhl.literature.search': literatureSearch,
  'bhl.literature.fulltext': literatureFulltext,
  'bhl.taxonomy.name_search': taxonomyNameSearch,
  'bhl.literature.by_subject': literatureBySubject,
};
