import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    search: z
      .string()
      .optional()
      .describe('Job search keywords (e.g. "python", "react developer", "product manager")'),
    category: z
      .string()
      .optional()
      .describe(
        'Job category slug: software-dev, design, customer-support, writing, marketing, sales, product, business, data, devops, finance, hr, qa, all-others',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(20)
      .describe('Max results (1-50, default 20)'),
  })
  .strip();

export const remotiveSchemas: Record<string, ZodSchema> = {
  'remotive.search': search,
};
