import { z, type ZodSchema } from 'zod';

const generate = z.object({
  prompt: z.string().min(1).max(10000).describe('Text prompt describing the image to generate (e.g. "a futuristic city at sunset, cyberpunk style, detailed")'),
  negative_prompt: z.string().optional().describe('What to exclude from the image (e.g. "blurry, low quality, text, watermark")'),
  aspect_ratio: z.enum(['1:1', '16:9', '21:9', '2:3', '3:2', '4:5', '5:4', '9:16', '9:21']).optional().describe('Image aspect ratio (default "1:1")'),
  style_preset: z.enum(['3d-model', 'analog-film', 'anime', 'cinematic', 'comic-book', 'digital-art', 'enhance', 'fantasy-art', 'isometric', 'line-art', 'low-poly', 'neon-punk', 'origami', 'photographic', 'pixel-art', 'tile-texture']).optional().describe('Style preset to guide generation'),
}).strip();

export const stabilitySchemas: Record<string, ZodSchema> = {
  'stability.generate': generate,
};
