import { z, type ZodSchema } from 'zod';

const extract = z
  .object({
    url: z
      .string()
      .url()
      .describe(
        'URL to scrape — returns raw HTML content. Fast and cheap ($0.00013 for simple sites). Example: "https://example.com"',
      ),
  })
  .strip();

const browser = z
  .object({
    url: z
      .string()
      .url()
      .describe(
        'URL to render with headless browser — returns JS-rendered HTML. Use for SPAs, dynamic content. More expensive than extract. Example: "https://example.com"',
      ),
  })
  .strip();

const screenshot = z
  .object({
    url: z
      .string()
      .url()
      .describe(
        'URL to screenshot — returns base64-encoded PNG image. Use for visual verification or page capture. Example: "https://example.com"',
      ),
  })
  .strip();

export const zyteSchemas: Record<string, ZodSchema> = {
  'scrape.extract': extract,
  'scrape.browser': browser,
  'scrape.screenshot': screenshot,
};
