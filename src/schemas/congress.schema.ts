import { z, type ZodSchema } from 'zod';

const bills = z
  .object({
    congress: z
      .number()
      .int()
      .min(93)
      .max(119)
      .optional()
      .describe('Congress number (93=1973 to 119=2025-2026). Default: current (119).'),
    type: z
      .enum(['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'])
      .optional()
      .describe('Bill type: hr (House), s (Senate), hjres, sjres, hconres, sconres, hres, sres'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of results (1-25, default 10)'),
  })
  .strip();

const billDetails = z
  .object({
    congress: z
      .number()
      .int()
      .min(93)
      .max(119)
      .describe('Congress number (e.g. 119 for 2025-2026, 118 for 2023-2024)'),
    type: z
      .enum(['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'])
      .describe('Bill type: hr (House bill), s (Senate bill), hjres, sjres, etc.'),
    number: z.number().int().min(1).describe('Bill number (e.g. 1 for HR 1)'),
  })
  .strip();

const members = z
  .object({
    state: z.string().length(2).optional().describe('US state code (e.g. CA, TX, NY)'),
    chamber: z.enum(['house', 'senate']).optional().describe('Chamber: house or senate'),
    congress: z
      .number()
      .int()
      .min(93)
      .max(119)
      .optional()
      .describe('Congress number. Default: current (119).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Number of results (1-25, default 10)'),
  })
  .strip();

export const congressSchemas: Record<string, ZodSchema> = {
  'congress.bills': bills,
  'congress.bill_details': billDetails,
  'congress.members': members,
};
