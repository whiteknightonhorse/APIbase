import { z, type ZodSchema } from 'zod';

const project = z
  .string()
  .min(1)
  .describe('Wikimedia project domain (e.g. en.wikipedia, de.wikipedia, commons.wikimedia)');

const access = z
  .enum(['all-access', 'desktop', 'mobile-app', 'mobile-web'])
  .optional()
  .describe('Access method filter (default all-access)');

const agent = z
  .enum(['all-agents', 'user', 'spider', 'automated'])
  .optional()
  .describe('Traffic agent filter (default all-agents)');

const dateField = (label: string) =>
  z
    .string()
    .regex(/^\d{8}$/)
    .describe(`${label} in YYYYMMDD format (e.g. 20260801)`);

const pageviewsAggregate = z
  .object({
    project,
    access,
    agent,
    granularity: z
      .enum(['daily', 'monthly'])
      .optional()
      .describe('Time bucket granularity (default daily)'),
    start: dateField('Start date'),
    end: dateField('End date'),
  })
  .strip();

const pageviewsTop = z
  .object({
    project,
    access,
    year: z
      .string()
      .regex(/^\d{4}$/)
      .describe('4-digit year (e.g. 2026)'),
    month: z
      .string()
      .regex(/^\d{2}$/)
      .describe('2-digit month (e.g. 08)'),
    day: z
      .string()
      .regex(/^(\d{2}|all-days)$/)
      .describe('2-digit day (e.g. 01), or "all-days" for the monthly top list'),
  })
  .strip();

const pageviewsPerArticle = z
  .object({
    project,
    article: z
      .string()
      .min(1)
      .describe('Article title, spaces or underscores accepted (e.g. Albert_Einstein)'),
    access,
    agent,
    granularity: z
      .enum(['daily', 'monthly'])
      .optional()
      .describe('Time bucket granularity (default daily)'),
    start: dateField('Start date'),
    end: dateField('End date'),
  })
  .strip();

const editsAggregate = z
  .object({
    project,
    editor_type: z
      .enum(['all-editor-types', 'anonymous', 'group-bot', 'name-bot', 'user'])
      .optional()
      .describe('Editor type filter (default all-editor-types)'),
    page_type: z
      .enum(['all-page-types', 'content', 'non-content'])
      .optional()
      .describe('Page namespace type filter (default all-page-types)'),
    granularity: z
      .enum(['daily', 'monthly'])
      .optional()
      .describe('Time bucket granularity (default monthly)'),
    start: dateField('Start date'),
    end: dateField('End date'),
  })
  .strip();

export const wikimediaAnalyticsSchemas: Record<string, ZodSchema> = {
  'wikimedia-analytics.pageviews_aggregate': pageviewsAggregate,
  'wikimedia-analytics.pageviews_top': pageviewsTop,
  'wikimedia-analytics.pageviews_per_article': pageviewsPerArticle,
  'wikimedia-analytics.edits_aggregate': editsAggregate,
};
