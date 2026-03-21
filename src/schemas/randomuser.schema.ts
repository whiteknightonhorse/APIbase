import { z, type ZodSchema } from 'zod';
const user = z.object({
  count: z.number().int().min(1).max(20).optional().describe('Number of random users to generate (default 1, max 20)'),
  nationality: z.string().optional().describe('Nationality filter — comma-separated ISO codes (e.g. "us", "gb,fr,de")'),
  gender: z.enum(['male', 'female']).optional().describe('Gender filter'),
}).strip();
export const randomuserSchemas: Record<string, ZodSchema> = { 'random.user': user };
