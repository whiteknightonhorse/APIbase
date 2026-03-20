import { z, type ZodSchema } from 'zod';

const translate = z.object({
  text: z.union([z.string(), z.array(z.string())]).describe('Text to translate — single string or array of strings for batch translation'),
  target: z.string().min(2).max(5).describe('Target language code (e.g. "es", "fr", "de", "ja", "zh", "ru", "ar")'),
  source: z.string().min(2).max(5).optional().describe('Source language code (auto-detected if omitted)'),
  format: z.enum(['text', 'html']).optional().describe('Input format: "text" (default) or "html" (preserves HTML tags)'),
}).strip();

const detect = z.object({
  text: z.union([z.string(), z.array(z.string())]).describe('Text to detect language of — single string or array'),
}).strip();

const languages = z.object({
  display_language: z.string().optional().describe('Language code to display names in (e.g. "en" returns "Spanish", "es" returns "Español")'),
}).strip();

export const langblySchemas: Record<string, ZodSchema> = {
  'langbly.translate': translate,
  'langbly.detect': detect,
  'langbly.languages': languages,
};
