import { z, type ZodSchema } from 'zod';

const check = z
  .object({
    email: z
      .string()
      .min(3)
      .describe('Email address to verify (e.g. user@example.com, test@gmail.com)'),
  })
  .strip();

export const emailVerifySchemas: Record<string, ZodSchema> = {
  'email_verify.check': check,
};
