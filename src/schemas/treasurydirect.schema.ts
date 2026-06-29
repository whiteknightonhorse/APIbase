import { z } from 'zod';
import type { ZodSchema } from 'zod';

export const treasuryDirectSchemas: Record<string, ZodSchema> = {
  'treasurydirect.auction_results': z
    .object({
      type: z
        .enum(['Bill', 'Note', 'Bond', 'TIPS', 'FRN', 'CMB'])
        .default('Bill')
        .describe(
          'Treasury security type to retrieve auction results for. Bill = short-term (4–52 week), Note = 2–10 year, Bond = 20–30 year, TIPS = inflation-protected, FRN = floating rate note, CMB = cash management bill.',
        ),
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(30)
        .describe(
          'Look-back window in calendar days (1–365). Returns auctions completed in this period.',
        ),
    })
    .strip(),

  'treasurydirect.upcoming_auctions': z
    .object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe(
          'Maximum number of upcoming auction announcements to return (1–50). Announcements cover Bills, Notes, and Bonds typically scheduled 1–2 weeks ahead.',
        ),
    })
    .strip(),

  'treasurydirect.search_cusip': z
    .object({
      cusip: z
        .string()
        .min(6)
        .max(9)
        .describe(
          'CUSIP identifier of the Treasury security to look up (6–9 alphanumeric characters, e.g. "912797TW7"). CUSIPs for recent T-Bills start with "9128" or "9127".',
        ),
    })
    .strip(),

  'treasurydirect.tips_rates': z
    .object({
      days: z
        .number()
        .int()
        .min(1)
        .max(1825)
        .default(365)
        .describe(
          'Look-back window in calendar days (1–1825, i.e. up to 5 years). Returns TIPS auction results with reference CPI values and real yield (highYield) for each auction.',
        ),
    })
    .strip(),
};
