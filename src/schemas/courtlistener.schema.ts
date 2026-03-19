import { z, type ZodSchema } from 'zod';

const search = z.object({
  query: z.string().describe('Search query for US court opinions (e.g. "artificial intelligence liability", "Fourth Amendment digital privacy")'),
  type: z.enum(['o', 'r']).optional().describe('Search type: "o" (opinions, default) or "r" (RECAP dockets)'),
  court: z.string().optional().describe('Court filter (e.g. "scotus" for Supreme Court, "ca9" for 9th Circuit, "dcd" for DC District)'),
  filed_after: z.string().optional().describe('Only cases filed after this date (YYYY-MM-DD)'),
  filed_before: z.string().optional().describe('Only cases filed before this date (YYYY-MM-DD)'),
  limit: z.number().int().min(1).max(20).optional().describe('Number of results (default 10, max 20)'),
  order_by: z.enum(['score desc', 'dateFiled desc', 'dateFiled asc']).optional().describe('Sort: relevance (default), newest, oldest'),
}).strip();

const opinion = z.object({
  opinion_id: z.string().describe('Opinion ID from search results'),
}).strip();

const dockets = z.object({
  query: z.string().describe('Search query for RECAP dockets'),
  court: z.string().optional().describe('Court filter'),
  limit: z.number().int().min(1).max(20).optional().describe('Number of results (default 10)'),
}).strip();

export const courtlistenerSchemas: Record<string, ZodSchema> = {
  'courtlistener.search': search,
  'courtlistener.opinion': opinion,
  'courtlistener.dockets': dockets,
};
