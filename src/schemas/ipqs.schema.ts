import { z, type ZodSchema } from 'zod';

const ipCheck = z.object({
  ip: z.string().describe('IPv4 or IPv6 address to check (e.g. "8.8.8.8", "2001:4860:4860::8888")'),
  strictness: z.number().int().min(0).max(3).optional().describe('Detection strictness 0-3 (0=least strict, 3=most aggressive). Higher catches more fraud but may flag legitimate users'),
  allow_public_access_points: z.boolean().optional().describe('Allow public WiFi/library IPs to pass without penalty (default false)'),
}).strip();

const emailCheck = z.object({
  email: z.string().describe('Email address to validate and check for fraud (e.g. "user@example.com")'),
  fast: z.boolean().optional().describe('Skip SMTP verification for faster response (default false)'),
  abuse_strictness: z.number().int().min(0).max(2).optional().describe('Abuse detection sensitivity 0-2 (0=low, 2=aggressive)'),
}).strip();

const urlCheck = z.object({
  url: z.string().describe('Full URL to scan for malware, phishing, and threats (e.g. "https://example.com/page")'),
  strictness: z.number().int().min(0).max(2).optional().describe('Scanning strictness 0-2 (0=least strict, 2=most aggressive)'),
}).strip();

const phoneCheck = z.object({
  phone: z.string().describe('Phone number to check in E.164 or national format (e.g. "+12125551234", "2125551234")'),
  country: z.string().optional().describe('ISO 2-letter country code for national format numbers (e.g. "US", "GB")'),
  strictness: z.number().int().min(0).max(2).optional().describe('Fraud detection strictness 0-2'),
}).strip();

export const ipqsSchemas: Record<string, ZodSchema> = {
  'ipqs.ip_check': ipCheck,
  'ipqs.email_check': emailCheck,
  'ipqs.url_check': urlCheck,
  'ipqs.phone_check': phoneCheck,
};
