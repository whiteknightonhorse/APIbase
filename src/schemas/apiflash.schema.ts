import { z, type ZodSchema } from 'zod';

const capture = z.object({
  url: z.string().url().describe('URL of the website to screenshot (e.g. "https://example.com")'),
  format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Image format: "png" (default), "jpeg", or "webp"'),
  width: z.number().int().min(100).max(3840).optional().describe('Viewport width in pixels (default 1920, max 3840)'),
  height: z.number().int().min(100).max(3840).optional().describe('Viewport height in pixels (default 1080)'),
  full_page: z.boolean().optional().describe('Capture full page scroll height (default false)'),
  delay: z.number().int().min(0).max(10).optional().describe('Wait N seconds before capture (0-10, for JS-heavy pages)'),
  no_ads: z.boolean().optional().describe('Block ads before capture (default false)'),
  no_cookie_banners: z.boolean().optional().describe('Remove cookie consent banners (default false)'),
  wait_until: z.enum(['page_loaded', 'network_idle']).optional().describe('"page_loaded" (default) or "network_idle" (wait for all XHR/fetch)'),
}).strip();

export const apiflashSchemas: Record<string, ZodSchema> = {
  'screenshot.capture': capture,
};
