import { z, type ZodSchema } from 'zod';

const company = z.object({
  domain: z.string().min(3).describe('Company domain name (e.g. "stripe.com", "google.com", "microsoft.com")'),
  limit: z.number().int().min(1).max(100).optional().describe('Max number of emails to return (default 10, max 100)'),
  department: z.enum([
    'executive', 'finance', 'hr', 'it', 'marketing',
    'operations', 'sales', 'legal', 'management', 'communication',
  ]).optional().describe('Filter by department (e.g. "engineering", "sales", "marketing")'),
  type: z.enum(['personal', 'generic']).optional().describe('Filter by email type: "personal" (name@domain) or "generic" (info@domain)'),
}).strip();

export const hunterSchemas: Record<string, ZodSchema> = {
  'hunter.company': company,
};
