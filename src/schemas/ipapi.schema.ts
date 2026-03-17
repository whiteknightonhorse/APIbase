import { z, type ZodSchema } from 'zod';

const lookup = z
  .object({
    ip: z
      .string()
      .describe('IPv4 or IPv6 address to look up (e.g. "8.8.8.8", "2001:4860:4860::8888")'),
  })
  .strip();

const bulkLookup = z
  .object({
    ips: z
      .array(z.string())
      .min(1)
      .max(100)
      .describe('Array of IPv4/IPv6 addresses to look up in bulk (max 100 per request)'),
  })
  .strip();

export const ipapiSchemas: Record<string, ZodSchema> = {
  'ip.lookup': lookup,
  'ip.bulk_lookup': bulkLookup,
};
