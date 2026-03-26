import { z } from 'zod';

const validateSchema = z.object({
  iban: z.string().describe('IBAN to validate (e.g. "DE89370400440532013000", "GB29NWBK60161331926819"). Spaces allowed, auto-stripped.'),
}).strip();

const calculateSchema = z.object({
  country_code: z.string().length(2).describe('ISO 3166-1 alpha-2 country code (e.g. "DE", "GB", "FR", "NL")'),
  bank_code: z.string().describe('Domestic bank code (e.g. "37040044" for Germany, "NWBK" for UK)'),
  account_number: z.string().describe('Account number in domestic format'),
  branch_code: z.string().optional().describe('Branch/sort code if required by the country (e.g. "601613" for UK)'),
}).strip();

export const ibanapiSchemas: Record<string, z.ZodSchema> = {
  'iban.validate': validateSchema,
  'iban.calculate': calculateSchema,
};
