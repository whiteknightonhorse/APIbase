import { z } from 'zod';

export const europepmcSchemas: Record<string, z.ZodTypeAny> = {
  'europepmc.search': z
    .object({
      query: z
        .string()
        .min(1)
        .describe(
          'Europe PMC search query. Supports full-text search and field-specific syntax: ' +
            'TITLE:"breast cancer", AUTH:"Smith J", JOURNAL:"Nature", DISEASE:"diabetes", ' +
            'MH:"neoplasms" (MeSH), GRANT_AGENCY:"Wellcome Trust", OPEN_ACCESS:Y. ' +
            'Free-text queries search across title, abstract, and MeSH terms.',
        ),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Number of results to return per page (1–100, default 10).'),
      page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
      result_type: z
        .enum(['lite', 'core'])
        .optional()
        .describe(
          'Detail level of results. "lite" returns basic bibliographic fields (title, authors, ' +
            'journal, year, DOI, PMID). "core" adds abstract, keywords, MeSH terms, affiliation, ' +
            'and citation count. Default: "lite".',
        ),
      sort: z
        .enum(['RELEVANCE', 'DATE', 'CITED'])
        .optional()
        .describe(
          'Sort order for results. "RELEVANCE" (default) ranks by relevance score. ' +
            '"DATE" returns newest first. "CITED" returns most-cited first.',
        ),
    })
    .strip(),

  'europepmc.article': z
    .object({
      id: z
        .string()
        .min(1)
        .describe(
          'Article identifier. For PubMed articles use the numeric PMID (e.g. "33000001"). ' +
            'For PMC full-text articles use the PMC ID without prefix (e.g. "7520369"). ' +
            'For other sources use the source-specific external ID.',
        ),
      src: z
        .enum(['MED', 'PMC', 'PPR', 'PAT', 'NBK', 'ETH', 'HIR', 'CTX'])
        .optional()
        .describe(
          'Source database for the article. "MED" = PubMed/MEDLINE (default, covers most ' +
            'biomedical literature). "PMC" = PubMed Central full-text repository. ' +
            '"PPR" = preprints (bioRxiv, medRxiv). "PAT" = patents. ' +
            '"NBK" = NCBI Bookshelf. "ETH" = EthOS theses.',
        ),
    })
    .strip(),

  'europepmc.citations': z
    .object({
      id: z
        .string()
        .min(1)
        .describe(
          'Numeric PMID (for MED/PubMed) or other source-specific ID of the article ' +
            'whose citing papers you want to retrieve (e.g. "30449648").',
        ),
      src: z
        .enum(['MED', 'PMC', 'PPR', 'PAT', 'NBK', 'ETH', 'HIR', 'CTX'])
        .optional()
        .describe(
          'Source database of the target article. "MED" = PubMed (default). ' +
            '"PMC" = PubMed Central full-text. Use the same src you used to find the article.',
        ),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('Number of citing articles to return per page (1–1000, default 10).'),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Page number for pagination when there are many citing articles (default 1).'),
    })
    .strip(),

  'europepmc.references': z
    .object({
      id: z
        .string()
        .min(1)
        .describe(
          'Numeric PMID (for MED/PubMed) or other source-specific ID of the article ' +
            'whose bibliography you want to retrieve (e.g. "30449648").',
        ),
      src: z
        .enum(['MED', 'PMC', 'PPR', 'PAT', 'NBK', 'ETH', 'HIR', 'CTX'])
        .optional()
        .describe(
          'Source database of the target article. "MED" = PubMed (default). ' +
            '"PMC" = PubMed Central full-text. Use the same src you used to find the article.',
        ),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('Number of references to return per page (1–1000, default 10).'),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Page number for pagination when a paper has many references (default 1).'),
    })
    .strip(),
};
