import { z, type ZodSchema } from 'zod';

const domainCheck = z.object({
  domains: z.string().min(3).describe('Comma-separated domain names to check availability (e.g. "example.com,mysite.io,startup.dev")'),
}).strip();

const domainRegister = z.object({
  domain: z.string().min(3).describe('Domain name to register (e.g. "mybusiness.com")'),
  years: z.number().int().min(1).max(10).optional().describe('Registration period in years (default 1, max 10)'),
  private: z.boolean().optional().describe('Enable free WHOIS privacy (default true)'),
}).strip();

const domainList = z.object({
  filter: z.string().optional().describe('Optional keyword to filter domain list'),
}).strip();

const domainInfo = z.object({
  domain: z.string().min(3).describe('Domain name to get details for (e.g. "example.com")'),
}).strip();

const getPrices = z.object({
  tld: z.string().optional().describe('Optional TLD to filter (e.g. "com", "io"). Omit for all popular TLDs'),
}).strip();

export const namesiloSchemas: Record<string, ZodSchema> = {
  'namesilo.domain_check': domainCheck,
  'namesilo.domain_register': domainRegister,
  'namesilo.domain_list': domainList,
  'namesilo.domain_info': domainInfo,
  'namesilo.get_prices': getPrices,
};
