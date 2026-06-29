import { z, type ZodSchema } from 'zod';

const articleSummary = z
  .object({
    title: z
      .string()
      .describe(
        'Wikipedia article title exactly as it appears in the URL (e.g. "Python_(programming_language)", ' +
          '"Albert_Einstein"). Use underscores for spaces. Case-sensitive.',
      ),
    language: z
      .string()
      .length(2)
      .optional()
      .describe(
        'Two-letter Wikipedia language code (e.g. "en" for English, "de" for German, "fr" for French). ' +
          'Defaults to English ("en").',
      ),
  })
  .strip();

const searchPages = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Search query string (e.g. "machine learning", "World War II", "quantum physics"). ' +
          'Searches article titles and content snippets.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (1–50, default 10).'),
    language: z
      .string()
      .length(2)
      .optional()
      .describe(
        'Two-letter Wikipedia language code (default "en" for English). ' +
          'Use "es" for Spanish, "zh" for Chinese, "ar" for Arabic, etc.',
      ),
  })
  .strip();

const articleMedia = z
  .object({
    title: z
      .string()
      .describe(
        'Wikipedia article title (e.g. "Eiffel_Tower", "Milky_Way"). ' +
          'Use underscores for spaces. Returns images and media files embedded in the article.',
      ),
    language: z
      .string()
      .length(2)
      .optional()
      .describe(
        'Two-letter Wikipedia language code (default "en"). ' +
          'Media availability varies across language editions.',
      ),
  })
  .strip();

const feedFeatured = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Date in YYYY-MM-DD format to fetch featured content for (e.g. "2024-07-04"). ' +
          'Defaults to today. Returns the daily featured article, featured image, and top 10 most-read articles.',
      ),
  })
  .strip();

const feedOnThisDay = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Date in YYYY-MM-DD format (e.g. "2024-07-04"). Only month and day are used — year is ignored. ' +
          'Returns historical events that happened on this month/day across all years. Defaults to today.',
      ),
  })
  .strip();

export const wikipediaSchemas: Record<string, ZodSchema> = {
  'wikipedia.article.summary': articleSummary,
  'wikipedia.search.pages': searchPages,
  'wikipedia.article.media': articleMedia,
  'wikipedia.feed.featured': feedFeatured,
  'wikipedia.feed.on_this_day': feedOnThisDay,
};
