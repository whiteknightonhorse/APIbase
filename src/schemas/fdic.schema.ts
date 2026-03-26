import { z } from 'zod';

const searchSchema = z.object({
  name: z.string().optional().describe('Partial or full institution name to search (e.g. "Chase", "Wells Fargo")'),
  city: z.string().optional().describe('City name filter (e.g. "New York", "San Francisco")'),
  state: z.string().optional().describe('US state name filter (e.g. "California", "New York")'),
  charter_class: z.enum(['N', 'SM', 'NM', 'SB', 'OI']).optional().describe('Charter type: N=national, SM=state member, NM=state nonmember, SB=savings bank, OI=OCC-supervised'),
  active: z.boolean().optional().describe('Filter by active status. Default true (only active institutions)'),
  limit: z.number().int().min(1).max(50).optional().describe('Number of results to return, max 50 (default 10)'),
}).strip();

const detailsSchema = z.object({
  cert: z.number().int().describe('FDIC certificate number uniquely identifying the institution (obtain via fdic.search)'),
}).strip();

const financialsSchema = z.object({
  cert: z.number().int().describe('FDIC certificate number for the institution'),
  limit: z.number().int().min(1).max(20).optional().describe('Number of quarterly periods to return, max 20 (default 4)'),
}).strip();

const failuresSchema = z.object({
  state: z.string().optional().describe('Two-letter US state code filter (e.g. "CA", "NY", "TX")'),
  limit: z.number().int().min(1).max(50).optional().describe('Number of results to return, max 50 (default 10)'),
}).strip();

export const fdicSchemas: Record<string, z.ZodSchema> = {
  'fdic.search': searchSchema,
  'fdic.details': detailsSchema,
  'fdic.financials': financialsSchema,
  'fdic.failures': failuresSchema,
};
