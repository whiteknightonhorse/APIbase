import { z, type ZodSchema } from 'zod';

const lookup = z
  .object({
    postcode: z
      .string()
      .min(7)
      .max(8)
      .describe(
        'Japanese 7-digit postal code with or without hyphen (e.g. "1000001" or "100-0001" for Chiyoda, "1500001" for Shibuya Jinguumae). Hyphens and spaces are stripped automatically.',
      ),
  })
  .strip();

const search = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Free-text search string in Japanese (kanji/kana) or romaji (e.g. "渋谷" for Shibuya, "Shinjuku", "銀座"). Matched against prefecture, city, and suburb fields.',
      ),
    prefecture: z
      .union([z.string(), z.number()])
      .optional()
      .describe(
        'Filter by prefecture JIS code (1–47) or prefecture name in Japanese (e.g. 13 or "東京都" for Tokyo, 27 for Osaka). Use the prefectures tool to get all codes.',
      ),
    city: z
      .string()
      .optional()
      .describe(
        'Filter by city name in Japanese (e.g. "渋谷区" for Shibuya ward, "大阪市北区" for Kita-ku Osaka).',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of results to return (1–100, default 20).'),
  })
  .strip();

const prefectures = z
  .object({
    _placeholder: z
      .string()
      .optional()
      .describe(
        'No parameters required. Returns all 47 Japanese prefectures with JIS code, names in kanji, hiragana, katakana, English, and region.',
      ),
  })
  .strip();

export const postcodeJapanSchemas: Record<string, ZodSchema> = {
  'postcode-japan.lookup': lookup,
  'postcode-japan.search': search,
  'postcode-japan.prefectures': prefectures,
};
