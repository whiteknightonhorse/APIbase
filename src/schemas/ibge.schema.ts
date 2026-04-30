import { z, type ZodSchema } from 'zod';

const states = z
  .object({
    refresh: z
      .boolean()
      .optional()
      .describe(
        'Set to true to bypass cache and fetch all 27 Brazilian states + DF with region hierarchy.',
      ),
  })
  .strip();

const municipalities = z
  .object({
    uf: z
      .string()
      .length(2)
      .optional()
      .describe(
        'Optional 2-letter Brazilian state code (e.g. "SP" for São Paulo, "RJ" for Rio de Janeiro). If omitted, returns all 5,570 municipalities.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .optional()
      .describe('Max municipalities to return (default 200, max 2000 — useful for pagination).'),
  })
  .strip();

const nameFrequency = z
  .object({
    name: z
      .string()
      .min(1)
      .describe(
        'First name (e.g. "MARIA", "JOSE"). Returns name frequency time-series by decade since 1930 from Brazilian census data.',
      ),
  })
  .strip();

const cnae = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Max CNAE economic activity classes to return (default 100, max 500).'),
  })
  .strip();

const regions = z
  .object({
    refresh: z
      .boolean()
      .optional()
      .describe(
        'Set to true to bypass cache and fetch the 5 Brazilian geographic regions (Norte, Nordeste, etc.).',
      ),
  })
  .strip();

export const ibgeSchemas: Record<string, ZodSchema> = {
  'ibge.states': states,
  'ibge.municipalities': municipalities,
  'ibge.name_frequency': nameFrequency,
  'ibge.cnae': cnae,
  'ibge.regions': regions,
};
