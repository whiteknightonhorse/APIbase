import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// federalregister.search — search Federal Register documents
// ---------------------------------------------------------------------------

const federalRegisterSearch = z
  .object({
    term: z
      .string()
      .optional()
      .describe('Full-text search term (e.g. "climate", "artificial intelligence").'),
    agency_slug: z
      .string()
      .optional()
      .describe(
        'Restrict results to one agency, by its slug (e.g. "environmental-protection-agency"). Look up slugs with federalregister.agencies.',
      ),
    type: z
      .enum(['RULE', 'PRORULE', 'NOTICE', 'PRESDOCU'])
      .optional()
      .describe(
        'Document type: RULE (final rule), PRORULE (proposed rule), NOTICE, or PRESDOCU (presidential document).',
      ),
    publication_date_gte: z
      .string()
      .optional()
      .describe('Only documents published on/after this date, format YYYY-MM-DD.'),
    publication_date_lte: z
      .string()
      .optional()
      .describe('Only documents published on/before this date, format YYYY-MM-DD.'),
    order: z
      .enum(['relevance', 'newest', 'oldest', 'executive_order_number'])
      .optional()
      .describe('Result ordering (default "newest").'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Results per page, 1-100 (default 20).'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// federalregister.document — get a single document by document number
// ---------------------------------------------------------------------------

const federalRegisterDocument = z
  .object({
    document_number: z
      .string()
      .min(1)
      .describe(
        'Federal Register document number, e.g. "2026-17477". Obtained from federalregister.search results.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// federalregister.agencies — search/list federal agencies
// ---------------------------------------------------------------------------

const federalRegisterAgencies = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Filter agencies by name substring, case-insensitive (e.g. "environmental"). Omit to list top agencies.',
      ),
    max: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of agencies to return (1-50, default 20).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// federalregister.public_inspection — current public inspection documents
// ---------------------------------------------------------------------------

const federalRegisterPublicInspection = z
  .object({
    agency: z
      .string()
      .optional()
      .describe(
        'Filter by agency name substring, case-insensitive (e.g. "postal"). Omit to return all currently filed documents.',
      ),
    max: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of documents to return (1-100, default 20).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const federalRegisterSchemas: Record<string, ZodSchema> = {
  'federalregister.search': federalRegisterSearch,
  'federalregister.document': federalRegisterDocument,
  'federalregister.agencies': federalRegisterAgencies,
  'federalregister.public_inspection': federalRegisterPublicInspection,
};
