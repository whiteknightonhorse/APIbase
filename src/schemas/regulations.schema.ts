import { z, type ZodSchema } from 'zod';

const search = z.object({
  query: z.string().optional().describe('Search keywords in federal regulatory documents (e.g. "artificial intelligence", "climate change")'),
  document_type: z.enum(['Rule', 'Proposed Rule', 'Notice', 'Presidential Document']).optional().describe('Filter by document type'),
  agency: z.string().optional().describe('Filter by agency ID (e.g. "EPA", "SEC", "FDA")'),
  posted_after: z.string().optional().describe('Only documents posted after this date (YYYY-MM-DD)'),
  limit: z.number().int().min(5).max(25).optional().describe('Number of results (default 10, min 5, max 25)'),
  sort: z.enum(['postedDate', '-postedDate', 'title', 'documentId']).optional().describe('Sort order (default: -postedDate, newest first)'),
}).strip();

const document = z.object({
  document_id: z.string().describe('Document ID from search results (e.g. "FDA-2024-N-0001-0001")'),
}).strip();

export const regulationsSchemas: Record<string, ZodSchema> = {
  'regulations.search': search,
  'regulations.document': document,
};
