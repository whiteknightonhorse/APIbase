import { z, type ZodSchema } from 'zod';

const RESEARCH_PRODUCT_TYPES = ['publication', 'dataset', 'software', 'other'] as const;

const search = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Free-text search across title, description, and author (e.g. "climate change adaptation", "CRISPR gene editing").',
      ),
    type: z
      .enum(RESEARCH_PRODUCT_TYPES)
      .optional()
      .describe(
        'Filter by research output type: publication, dataset, software, or other (e.g. patents, workflows).',
      ),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Results per page (default 10, max 50).'),
  })
  .strip();

const productDetails = z
  .object({
    product_id: z
      .string()
      .min(1)
      .describe(
        'OpenAIRE research product ID (e.g. "doi_dedup___::4807efad8ff855adaa51d3c5c5390481") — obtained from openaire.search results.',
      ),
  })
  .strip();

const projectSearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Free-text search across project title, acronym, and keywords (e.g. "renewable energy", "H2020").',
      ),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Results per page (default 10, max 50).'),
  })
  .strip();

const organizationSearch = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Free-text search across organization legal name and alternative names (e.g. "CERN", "University of Oxford").',
      ),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Results per page (default 10, max 50).'),
  })
  .strip();

export const openaireSchemas: Record<string, ZodSchema> = {
  'openaire.search': search,
  'openaire.product_details': productDetails,
  'openaire.project_search': projectSearch,
  'openaire.organization_search': organizationSearch,
};
