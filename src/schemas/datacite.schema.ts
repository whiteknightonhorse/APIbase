import { z, type ZodSchema } from 'zod';

const doiSearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Full-text search query across DOI metadata: titles, abstracts, creator names, subjects. Examples: "climate change", "CRISPR gene editing", "COVID-19 epidemiology".',
      ),
    resource_type: z
      .enum([
        'dataset',
        'software',
        'text',
        'image',
        'audiovisual',
        'collection',
        'preprint',
        'journal-article',
        'conference-paper',
        'dissertation',
        'report',
        'model',
        'workflow',
        'computational-notebook',
        'other',
      ])
      .optional()
      .describe(
        'Filter by DataCite resource type. "dataset" returns data files, "software" returns code repositories, "preprint" returns preprints (mostly arXiv/Zenodo), "text" includes general text outputs.',
      ),
    publication_year: z
      .number()
      .int()
      .min(1900)
      .max(2030)
      .optional()
      .describe(
        'Filter by publication year (e.g. 2023). Returns only DOIs published in that calendar year.',
      ),
    client_id: z
      .string()
      .optional()
      .describe(
        'Filter by DataCite repository/client ID. Examples: "cern.zenodo" (Zenodo), "figshare.ars" (figshare), "bl.mendeley" (Mendeley Data), "cos.osf" (Open Science Framework). Get IDs from datacite.client.search.',
      ),
    funder_id: z
      .string()
      .optional()
      .describe(
        'Filter by funder ROR ID or Crossref Funder ID. Examples: "https://doi.org/10.13039/100000001" (US NSF), "https://doi.org/10.13039/100004440" (Wellcome Trust).',
      ),
    sort: z
      .enum(['relevance', 'published', '-published', 'created', '-created'])
      .optional()
      .describe(
        'Sort order for results. "relevance" (default) uses full-text score. "-published" returns newest first. "published" returns oldest first.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results per page (1–50, default 10).'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
  })
  .strip();

const doiLookup = z
  .object({
    doi: z
      .string()
      .describe(
        'The DOI to look up. Accepts bare DOI (e.g. "10.5281/zenodo.3490396") or full URL form ("https://doi.org/10.5281/zenodo.3490396"). Must be a DataCite-registered DOI.',
      ),
  })
  .strip();

const worksStats = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Optional keyword query to scope the statistics (e.g. "machine learning" returns stats only for ML-related DOIs). If omitted, stats cover all 70M+ DataCite works.',
      ),
    resource_type: z
      .enum([
        'dataset',
        'software',
        'text',
        'image',
        'audiovisual',
        'collection',
        'preprint',
        'journal-article',
        'conference-paper',
        'dissertation',
        'report',
        'model',
        'workflow',
        'computational-notebook',
        'other',
      ])
      .optional()
      .describe(
        'Scope statistics to a single resource type (e.g. "dataset" to see dataset-specific provider breakdowns).',
      ),
    publication_year: z
      .number()
      .int()
      .min(1900)
      .max(2030)
      .optional()
      .describe('Scope statistics to a specific publication year.'),
  })
  .strip();

const clientSearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Search DataCite member repositories by name or keyword. Examples: "zenodo", "dryad", "figshare", "harvard", "pangaea". Returns matching repositories with their DOI counts.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of repositories per page (1–50, default 10).'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
  })
  .strip();

export const dataciteSchemas: Record<string, ZodSchema> = {
  'datacite.doi.search': doiSearch,
  'datacite.doi.lookup': doiLookup,
  'datacite.works.stats': worksStats,
  'datacite.client.search': clientSearch,
};
