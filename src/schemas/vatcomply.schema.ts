import { z, type ZodSchema } from 'zod';

const validate = z.object({
  vat_number: z.string().min(4).describe('EU VAT number with country prefix (e.g. "DE123456789", "FR12345678901", "GB123456789")'),
}).strip();

const rates = z.object({
  country_code: z.string().length(2).optional().describe('ISO 3166-1 alpha-2 country code for specific country VAT rates (e.g. "DE", "FR", "IT"). Omit for all EU countries'),
}).strip();

const currencies = z.object({
  filter: z.string().optional().describe('Optional currency code filter (e.g. "USD", "GBP"). Omit for all currencies'),
}).strip();

export const vatcomplySchemas: Record<string, ZodSchema> = {
  'vatcomply.validate': validate,
  'vatcomply.rates': rates,
  'vatcomply.currencies': currencies,
};
