import { z, type ZodSchema } from 'zod';

const zonesList = z.object({
  name: z.string().optional().describe('Filter by domain name (e.g. "example.com")'),
  status: z.enum(['active', 'pending', 'initializing', 'moved', 'deleted']).optional().describe('Filter by zone status'),
  limit: z.number().int().min(1).max(50).optional().describe('Results per page (default 20, max 50)'),
}).strip();

const dnsList = z.object({
  zone_id: z.string().min(1).describe('Cloudflare Zone ID (from zones_list results)'),
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']).optional().describe('Filter by record type'),
  name: z.string().optional().describe('Filter by record name (e.g. "www.example.com")'),
  limit: z.number().int().min(1).max(100).optional().describe('Results per page (default 50, max 100)'),
}).strip();

const dnsCreate = z.object({
  zone_id: z.string().min(1).describe('Cloudflare Zone ID'),
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']).describe('DNS record type'),
  name: z.string().min(1).describe('Record name — subdomain or "@" for root (e.g. "www", "api", "@")'),
  content: z.string().min(1).describe('Record value — IP address for A/AAAA, hostname for CNAME, text for TXT'),
  ttl: z.number().int().optional().describe('TTL in seconds (1 = automatic, 60-86400 for manual)'),
  proxied: z.boolean().optional().describe('Enable Cloudflare CDN proxy (default false). True = orange cloud, hides origin IP'),
  priority: z.number().int().optional().describe('Priority for MX records (e.g. 10, 20)'),
}).strip();

const dnsDelete = z.object({
  zone_id: z.string().min(1).describe('Cloudflare Zone ID'),
  record_id: z.string().min(1).describe('DNS record ID to delete (from dns_list results)'),
}).strip();

const zoneAnalytics = z.object({
  zone_id: z.string().min(1).describe('Cloudflare Zone ID'),
  since: z.number().int().optional().describe('Minutes ago to start from (e.g. -1440 for last 24h, -10080 for last 7 days)'),
}).strip();

const purgeCache = z.object({
  zone_id: z.string().min(1).describe('Cloudflare Zone ID'),
  purge_everything: z.boolean().optional().describe('Purge all cached files (default false)'),
  files: z.array(z.string().url()).optional().describe('Specific URLs to purge (max 30)'),
}).strip();

export const cloudflareSchemas: Record<string, ZodSchema> = {
  'cloudflare.zones_list': zonesList,
  'cloudflare.dns_list': dnsList,
  'cloudflare.dns_create': dnsCreate,
  'cloudflare.dns_delete': dnsDelete,
  'cloudflare.zone_analytics': zoneAnalytics,
  'cloudflare.purge_cache': purgeCache,
};
