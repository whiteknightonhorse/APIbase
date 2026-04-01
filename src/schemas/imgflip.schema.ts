import { z, type ZodSchema } from 'zod';

const memes = z
  .object({
    search: z
      .string()
      .optional()
      .describe(
        'Optional: filter memes by name (client-side). Returns top 100 popular meme templates.',
      ),
  })
  .strip();

const caption = z
  .object({
    template_id: z
      .string()
      .describe(
        'Meme template ID from imgflip.memes (e.g. "181913649" for Drake Hotline Bling, "87743020" for Two Buttons)',
      ),
    top_text: z.string().optional().describe('Top text on the meme'),
    bottom_text: z.string().optional().describe('Bottom text on the meme'),
  })
  .strip();

export const imgflipSchemas: Record<string, ZodSchema> = {
  'imgflip.memes': memes,
  'imgflip.caption': caption,
};
