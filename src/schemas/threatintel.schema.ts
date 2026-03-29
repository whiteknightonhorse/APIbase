import { z, type ZodSchema } from 'zod';

const reputation = z.object({
  domain: z.string().min(1).describe('Domain name to check reputation (e.g. "google.com", "suspicious-site.xyz"). Returns reputation score 0-100 and security test results'),
}).strip();

const malware = z.object({
  domain: z.string().min(1).describe('Domain name to check for malware and phishing (e.g. "example.com"). Returns safe score 0-100 and warning details'),
}).strip();

const infrastructure = z.object({
  domain: z.string().min(1).describe('Domain name to analyze infrastructure (e.g. "google.com"). Returns all associated IPs, geolocation, subnets, and resource types'),
}).strip();

export const threatintelSchemas: Record<string, ZodSchema> = {
  'threatintel.reputation': reputation,
  'threatintel.malware': malware,
  'threatintel.infrastructure': infrastructure,
};
