import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    language: z
      .string()
      .optional()
      .describe(
        'ISO 639-3 language code of the source sentence (default "eng"). Use tatoeba.languages to discover codes.',
      ),
    query: z.string().optional().describe('Optional keyword search inside sentence text.'),
    translation_lang: z
      .string()
      .optional()
      .describe(
        'ISO 639-3 code of a target language — only return sentences that have a translation into this language.',
      ),
    has_audio: z
      .boolean()
      .optional()
      .describe('Filter to sentences that have a human audio recording attached.'),
    sort: z
      .enum(['relevance', 'words', 'created', 'modified', 'random'])
      .optional()
      .describe(
        'Sort order — "relevance" (default), "words" (length), "created", "modified", or "random".',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Max sentences to return (default 10, max 50).'),
  })
  .strip();

const sentence = z
  .object({
    sentence_id: z
      .number()
      .int()
      .min(1)
      .describe(
        'Tatoeba sentence ID. Returns the sentence with all translations and audio recordings.',
      ),
  })
  .strip();

const languages = z
  .object({
    refresh: z
      .boolean()
      .optional()
      .describe(
        'Set to true to bypass cache and fetch the latest list of supported languages with sentence counts.',
      ),
  })
  .strip();

export const tatoebaSchemas: Record<string, ZodSchema> = {
  'tatoeba.search': search,
  'tatoeba.sentence': sentence,
  'tatoeba.languages': languages,
};
