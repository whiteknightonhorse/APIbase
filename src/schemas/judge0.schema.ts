import { z, type ZodSchema } from 'zod';

const execute = z
  .object({
    language_id: z
      .number()
      .int()
      .describe(
        'Language ID from code.languages (e.g. 71=Python 3, 63=JavaScript, 62=Java, 54=C++, 60=Go, 73=Rust, 51=C#, 46=Bash). Call code.languages for full list',
      ),
    source_code: z.string().min(1).describe('Source code to execute'),
    stdin: z.string().optional().describe('Standard input to feed to the program'),
    cpu_time_limit: z.number().optional().describe('CPU time limit in seconds (default 5, max 15)'),
    memory_limit: z.number().optional().describe('Memory limit in KB (default 128000 = 128MB)'),
  })
  .strip();

const languages = z
  .object({
    filter: z
      .string()
      .optional()
      .describe(
        'Optional filter — substring match on language name (e.g. "python", "java", "rust"). Returns all 71 languages if omitted',
      ),
  })
  .strip();

export const judge0Schemas: Record<string, ZodSchema> = {
  'code.execute': execute,
  'code.languages': languages,
};
