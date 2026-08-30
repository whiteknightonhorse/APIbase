import { z, type ZodSchema } from 'zod';

const lang = z
  .string()
  .regex(/^[a-z]{2,3}(-[a-z0-9]{1,8})?$/i)
  .optional()
  .describe('Wikipedia language edition subdomain code (default en, e.g. de, fr, ja, zh-yue)');

const title = z
  .string()
  .min(1)
  .describe('Article title, spaces or underscores accepted (e.g. Albert_Einstein)');

const pageSummary = z
  .object({
    title,
    lang,
  })
  .strip();

const searchPage = z
  .object({
    query: z.string().min(1).describe('Full-text search query (e.g. "einstein relativity")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return, 1-50 (default 10)'),
    lang,
  })
  .strip();

const onThisDay = z
  .object({
    type: z
      .enum(['births', 'deaths', 'events', 'holidays', 'selected'])
      .describe('Category of historical events to return'),
    month: z
      .string()
      .regex(/^\d{2}$/)
      .describe('2-digit month (e.g. 08 for August)'),
    day: z
      .string()
      .regex(/^\d{2}$/)
      .describe('2-digit day of month (e.g. 30)'),
    lang,
  })
  .strip();

const mediaList = z
  .object({
    title,
    lang,
  })
  .strip();

export const wikimediaRestSchemas: Record<string, ZodSchema> = {
  'wikimedia-rest.page_summary': pageSummary,
  'wikimedia-rest.search_page': searchPage,
  'wikimedia-rest.on_this_day': onThisDay,
  'wikimedia-rest.media_list': mediaList,
};
