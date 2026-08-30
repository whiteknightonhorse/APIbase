import { z, type ZodSchema } from 'zod';

const query = z
  .string()
  .min(1)
  .max(500)
  .describe('Search query or topic to look up (e.g. "Python programming language", "coffee")');

const instantAnswer = z
  .object({
    query,
  })
  .strip();

const relatedTopics = z
  .object({
    query,
  })
  .strip();

export const duckduckgoSchemas: Record<string, ZodSchema> = {
  'duckduckgo.instant_answer': instantAnswer,
  'duckduckgo.related_topics': relatedTopics,
};
