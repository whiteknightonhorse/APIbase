import { z, type ZodSchema } from 'zod';

const jobs = z
  .object({
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .default(1)
      .describe(
        'Page number (default 1). Each page returns ~100 EU job listings sorted by newest first. No server-side search — use page to browse',
      ),
  })
  .strip();

export const arbeitnowSchemas: Record<string, ZodSchema> = {
  'arbeitnow.jobs': jobs,
};
