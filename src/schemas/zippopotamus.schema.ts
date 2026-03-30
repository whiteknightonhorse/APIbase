import { z, type ZodSchema } from 'zod';

const lookup = z
  .object({
    country_code: z
      .string()
      .min(2)
      .max(2)
      .describe(
        'ISO 3166-1 alpha-2 country code (e.g. "us", "de", "gb", "fr", "jp", "br", "in", "au"). Supports 60+ countries',
      ),
    postal_code: z
      .string()
      .min(1)
      .describe(
        'Postal/ZIP code (e.g. "90210" for US, "10115" for Germany, "SW1A" for UK, "75001" for France)',
      ),
  })
  .strip();

export const zippopotamusSchemas: Record<string, ZodSchema> = {
  'postal.lookup': lookup,
};
