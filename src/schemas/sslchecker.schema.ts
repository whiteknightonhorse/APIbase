import { z, type ZodSchema } from 'zod';

const check = z.object({
  domain: z.string().min(3).describe('Domain name to check SSL certificate for (e.g. "google.com", "apibase.pro"). Do not include https://.'),
}).strip();

export const sslcheckerSchemas: Record<string, ZodSchema> = {
  'ssl.check': check,
};
