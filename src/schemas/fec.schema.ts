import { z, type ZodSchema } from 'zod';

const candidates = z
  .object({
    q: z.string().optional().describe('Free-text candidate name search (e.g. "Sanders", "Trump").'),
    cycle: z
      .number()
      .int()
      .optional()
      .describe('Election cycle year — even number (e.g. 2024, 2022, 2020).'),
    office: z
      .enum(['H', 'S', 'P'])
      .optional()
      .describe('Office: "H" House of Representatives, "S" Senate, "P" Presidential.'),
    state: z.string().length(2).optional().describe('2-letter state code (e.g. "CA", "TX").'),
    party: z.string().optional().describe('Party abbreviation (e.g. "REP", "DEM", "LIB", "GRE").'),
    page: z.number().int().min(1).optional().describe('Page number (default 1).'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Per-page count (default 20, max 100).'),
  })
  .strip();

const committeeTotals = z
  .object({
    cycle: z.number().int().optional().describe('Election cycle year (e.g. 2024).'),
    committee_type: z
      .string()
      .optional()
      .describe(
        'Committee type code: "P" Presidential, "H" House, "S" Senate, "X" Party, "Y" Party-Qualified, "N" PAC, "Q" PAC-Qualified, "O" Super PAC.',
      ),
    page: z.number().int().min(1).optional().describe('Page number (default 1).'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Per-page count (default 20, max 100).'),
  })
  .strip();

const superPacSpending = z
  .object({
    cycle: z.number().int().optional().describe('Election cycle year (e.g. 2024).'),
    candidate_id: z
      .string()
      .optional()
      .describe(
        'FEC candidate ID (from fec.candidates) — return only expenditures targeting this candidate.',
      ),
    support_oppose: z
      .enum(['S', 'O'])
      .optional()
      .describe('"S" support / "O" oppose. If omitted, both directions returned.'),
    page: z.number().int().min(1).optional().describe('Page number (default 1).'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Per-page count (default 20, max 100).'),
  })
  .strip();

const elections = z
  .object({
    cycle: z.number().int().optional().describe('Election cycle year (e.g. 2024).'),
    office: z
      .enum(['H', 'S', 'P'])
      .optional()
      .describe('Office: "H" House, "S" Senate, "P" Presidential.'),
    state: z.string().length(2).optional().describe('2-letter state code.'),
    page: z.number().int().min(1).optional().describe('Page number (default 1).'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Per-page count (default 20, max 100).'),
  })
  .strip();

export const fecSchemas: Record<string, ZodSchema> = {
  'fec.candidates': candidates,
  'fec.committee_totals': committeeTotals,
  'fec.super_pac_spending': superPacSpending,
  'fec.elections': elections,
};
