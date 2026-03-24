import { z, type ZodSchema } from 'zod';

const search = z.object({
  query: z.string().optional().describe('Search term (e.g. "diabetes", "pembrolizumab", "Pfizer COVID vaccine")'),
  condition: z.string().optional().describe('Filter by medical condition (e.g. "Breast Cancer", "Alzheimer", "Type 2 Diabetes")'),
  intervention: z.string().optional().describe('Filter by drug/device/procedure name (e.g. "aspirin", "pacemaker", "chemotherapy")'),
  status: z.enum(['RECRUITING', 'COMPLETED', 'ACTIVE_NOT_RECRUITING', 'NOT_YET_RECRUITING', 'TERMINATED', 'WITHDRAWN', 'SUSPENDED']).optional().describe('Filter by trial status'),
  limit: z.number().int().min(1).max(100).optional().describe('Results per page (default 10, max 100)'),
}).strip();

const study = z.object({
  nct_id: z.string().min(1).describe('NCT identifier (e.g. "NCT03491410", "NCT04368728"). Get from search results'),
}).strip();

const stats = z.object({
  filter: z.string().optional().describe('Optional — currently returns total database statistics'),
}).strip();

export const clinicaltrialsSchemas: Record<string, ZodSchema> = {
  'clinical.search': search,
  'clinical.study': study,
  'clinical.stats': stats,
};
