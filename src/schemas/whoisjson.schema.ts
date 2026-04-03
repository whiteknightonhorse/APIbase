import { z, type ZodSchema } from 'zod';

const sslCheck = z
  .object({
    domain: z
      .string()
      .min(1)
      .describe('Domain name to check SSL certificate (e.g. google.com, apibase.pro)'),
  })
  .strip();

const subdomains = z
  .object({
    domain: z
      .string()
      .min(1)
      .describe('Domain name to discover subdomains (e.g. github.com, example.com)'),
  })
  .strip();

export const whoisjsonSchemas: Record<string, ZodSchema> = {
  'whoisjson.ssl_check': sslCheck,
  'whoisjson.subdomains': subdomains,
};
