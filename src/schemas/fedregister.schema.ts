import { z, type ZodSchema } from 'zod';

const search = z.object({
  query: z.string().optional().describe('Search keywords in Federal Register (e.g. "executive order", "cryptocurrency regulation")'),
  document_type: z.enum(['RULE', 'PRORULE', 'NOTICE', 'PRESDOCU']).optional().describe('Type: RULE (final rule), PRORULE (proposed rule), NOTICE, PRESDOCU (presidential document/executive order)'),
  agency: z.string().optional().describe('Agency slug (e.g. "environmental-protection-agency", "securities-and-exchange-commission")'),
  published_after: z.string().optional().describe('Only documents published after this date (MM/DD/YYYY)'),
  limit: z.number().int().min(1).max(20).optional().describe('Number of results (default 10, max 20)'),
  sort: z.enum(['newest', 'oldest', 'relevance']).optional().describe('Sort order (default: newest)'),
}).strip();

const document = z.object({
  document_number: z.string().describe('Federal Register document number (e.g. "2026-12345")'),
}).strip();

const recent = z.object({
  document_type: z.enum(['RULE', 'PRORULE', 'NOTICE', 'PRESDOCU']).optional().describe('Filter by type (default: all types)'),
  limit: z.number().int().min(1).max(20).optional().describe('Number of results (default 10, max 20)'),
}).strip();

export const fedregisterSchemas: Record<string, ZodSchema> = {
  'fedregister.search': search,
  'fedregister.document': document,
  'fedregister.recent': recent,
};
