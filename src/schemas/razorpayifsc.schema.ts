import { z, type ZodSchema } from 'zod';

/**
 * Zod schemas for Razorpay IFSC tools (UC-425).
 *
 * API: https://ifsc.razorpay.com
 * Auth: None (public, MIT-licensed open data)
 */

const razorpayifscLookupSchema = z
  .object({
    ifsc_code: z
      .string()
      .length(11)
      .describe(
        '11-character IFSC code (e.g. SBIN0005943). Format: 4 letters (bank code) + 0 + 6 digits (branch code).',
      ),
  })
  .strip();

export const razorpayifscSchemas: Record<string, ZodSchema> = {
  'razorpayifsc.lookup': razorpayifscLookupSchema,
};
