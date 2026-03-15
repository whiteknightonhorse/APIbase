import { z, type ZodSchema } from 'zod';

const whoisLookup = z
  .object({
    domain: z.string().describe('Domain name, IPv4, IPv6, or email address for WHOIS lookup (e.g. "google.com", "8.8.8.8")'),
    prefer_fresh: z.boolean().optional().describe('Get latest WHOIS record even if incomplete (default false)'),
    include_ips: z.boolean().optional().describe('Include resolved IP addresses for the domain (default false)'),
    check_availability: z.boolean().optional().describe('Also check domain availability status (default false)'),
  })
  .strip();

const whoisDnsLookup = z
  .object({
    domain: z.string().describe('Domain name to look up DNS records for (e.g. "google.com")'),
    record_type: z
      .enum(['A', 'AAAA', 'MX', 'NS', 'SOA', 'TXT', 'CNAME', 'SRV', 'CAA', '_all'])
      .optional()
      .describe('DNS record type to query: A, AAAA, MX, NS, SOA, TXT, CNAME, SRV, CAA, or _all (default _all)'),
  })
  .strip();

const whoisAvailability = z
  .object({
    domain: z.string().describe('Domain name to check availability for (e.g. "example.com", "mybrand.io")'),
    mode: z
      .enum(['DNS_ONLY', 'DNS_AND_WHOIS'])
      .optional()
      .describe('Check mode: DNS_ONLY is fast, DNS_AND_WHOIS is more accurate (default DNS_AND_WHOIS)'),
  })
  .strip();

const whoisReverse = z
  .object({
    keyword: z.string().describe('Search keyword to find domains — registrant name, email, company, or address (e.g. "John Smith", "acme.com")'),
  })
  .strip();

export const whoisxmlSchemas: Record<string, ZodSchema> = {
  'whois.lookup': whoisLookup,
  'whois.dns_lookup': whoisDnsLookup,
  'whois.availability': whoisAvailability,
  'whois.reverse': whoisReverse,
};
