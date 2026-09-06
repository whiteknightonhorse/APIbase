import { z, type ZodSchema } from 'zod';

const orcidIdField = z
  .string()
  .regex(
    /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/,
    'ORCID iD must be in the form 0000-0000-0000-0000 (last character may be X)',
  )
  .describe('ORCID iD, e.g. "0000-0002-1825-0097". Obtain one from orcid.search_researcher.');

const searchResearcher = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Researcher search query — a plain name (e.g. "Jane Smith") or a Solr-style field query ' +
          '(e.g. "family-name:Carberry", "affiliation-org-name:MIT AND given-names:Jane").',
      ),
    rows: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results to return (1-50, default 10).'),
    start: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset into the result set for pagination (default 0).'),
  })
  .strip();

const getPerson = z
  .object({
    orcid_id: orcidIdField,
  })
  .strip();

const getWorks = z
  .object({
    orcid_id: orcidIdField,
  })
  .strip();

export const orcidSchemas: Record<string, ZodSchema> = {
  'orcid.search_researcher': searchResearcher,
  'orcid.get_person': getPerson,
  'orcid.get_works': getWorks,
};
