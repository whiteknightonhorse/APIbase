import { z, type ZodSchema } from 'zod';

const define = z
  .object({
    word: z.string().describe('Word to define (e.g. "algorithm", "serendipity", "ubuntu")'),
    language: z
      .string()
      .optional()
      .default('en')
      .describe('Language code: en, es, fr, de, it, pt, ru, ar, hi, ja, ko, zh (default: en)'),
  })
  .strip();

const words = z
  .object({
    meaning: z
      .string()
      .optional()
      .describe('Find words with this meaning (e.g. "happy" → pleased, blissful, content)'),
    sounds_like: z
      .string()
      .optional()
      .describe('Find words that sound like this (e.g. "elefant" → elephant)'),
    rhymes_with: z
      .string()
      .optional()
      .describe('Find words that rhyme with this (e.g. "algorithm" → rhythm, logarithm)'),
    starts_with: z
      .string()
      .optional()
      .describe('Find words starting with these letters (e.g. "algor" → algorithm, algorithmic)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .default(10)
      .describe('Max results (1-25, default 10)'),
  })
  .strip();

export const dictionarySchemas: Record<string, ZodSchema> = {
  'dictionary.define': define,
  'dictionary.words': words,
};
