import { z, type ZodSchema } from 'zod';

const validate = z
  .object({
    email: z
      .string()
      .email()
      .describe('Email address to validate (e.g. "user@example.com")'),
    ip_address: z
      .string()
      .optional()
      .describe('IP address of the email owner for additional geo/fraud scoring (optional)'),
  })
  .strip();

export const zerobounceSchemas: Record<string, ZodSchema> = {
  'email.validate': validate,
};
