import { z, type ZodSchema } from 'zod';

const companySearch = z.object({
  query: z.string().min(1).describe('Company name, ticker, or keyword to search (e.g. "Apple Inc", "TSLA", "artificial intelligence")'),
  limit: z.number().int().min(1).max(50).optional().describe('Max results to return (default 10, max 50)'),
}).strip();

const filings = z.object({
  cik: z.string().min(1).describe('SEC CIK number (e.g. "320193" for Apple, "789019" for Microsoft). Find via company_search'),
}).strip();

const companyFacts = z.object({
  cik: z.string().min(1).describe('SEC CIK number (e.g. "320193" for Apple). Returns XBRL financial facts: revenue, net income, assets, liabilities'),
}).strip();

export const edgarSchemas: Record<string, ZodSchema> = {
  'edgar.company_search': companySearch,
  'edgar.filings': filings,
  'edgar.company_facts': companyFacts,
};
