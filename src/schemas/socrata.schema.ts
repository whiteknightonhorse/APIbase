import { z, type ZodSchema } from 'zod';

const DATASET_ID_RE = /^[a-z0-9]{4}-[a-z0-9]{4}$/i;

const datasetSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Free-text search across dataset name/description/tags, e.g. "covid" or "budget"'),
    domains: z
      .string()
      .min(1)
      .max(500)
      .optional()
      .describe(
        'Comma-separated Socrata portal hostname(s) to scope the search to, e.g. "data.cityofnewyork.us"',
      ),
    category: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe(
        'Filter by Socrata domain category, e.g. "Health", "Transportation", "Public Safety"',
      ),
    tags: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Comma-separated tag filter, e.g. "budget,finance"'),
    only: z
      .enum(['dataset', 'chart', 'map', 'file', 'story', 'href'])
      .optional()
      .describe('Asset type to return (default "dataset")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max results to return, 1-50 (default 10)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
  })
  .strip()
  .describe(
    'Search the Socrata Discovery API — a cross-portal catalog covering thousands of ' +
      'government/civic open-data portals worldwide',
  );

const datasetMetadata = z
  .object({
    domain: z
      .string()
      .min(3)
      .max(253)
      .describe(
        'Socrata portal hostname, e.g. "data.cityofnewyork.us" (from socrata.dataset_search results)',
      ),
    dataset_id: z
      .string()
      .regex(DATASET_ID_RE, 'must be a Socrata 4x4 identifier, e.g. "erm2-nwe9"')
      .describe(
        'Socrata dataset 4x4 identifier, e.g. "erm2-nwe9" (from socrata.dataset_search results)',
      ),
  })
  .strip()
  .describe('Get full metadata and column schema for one dataset on a specific Socrata portal');

const queryDataset = z
  .object({
    domain: z
      .string()
      .min(3)
      .max(253)
      .describe(
        'Socrata portal hostname, e.g. "data.cityofnewyork.us" (from socrata.dataset_search results)',
      ),
    dataset_id: z
      .string()
      .regex(DATASET_ID_RE, 'must be a Socrata 4x4 identifier, e.g. "erm2-nwe9"')
      .describe(
        'Socrata dataset 4x4 identifier, e.g. "erm2-nwe9" (from socrata.dataset_search results)',
      ),
    select: z
      .string()
      .min(1)
      .max(500)
      .optional()
      .describe(
        'SoQL $select clause, e.g. "complaint_type,count(*)" (see socrata.dataset_metadata for column names)',
      ),
    where: z
      .string()
      .min(1)
      .max(500)
      .optional()
      .describe('SoQL $where clause, e.g. "borough=\'BROOKLYN\'" or "created_date>\'2026-01-01\'"'),
    order: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('SoQL $order clause, e.g. "created_date DESC"'),
    group: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('SoQL $group clause, e.g. "complaint_type"'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Max rows to return, 1-1000 (default 50)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
  })
  .strip()
  .describe("Run a SoQL data query against a specific dataset's actual rows on a Socrata portal");

export const socrataSchemas: Record<string, ZodSchema> = {
  'socrata.dataset_search': datasetSearch,
  'socrata.dataset_metadata': datasetMetadata,
  'socrata.query_dataset': queryDataset,
};
