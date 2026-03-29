import { z, type ZodSchema } from 'zod';

const recognize = z.object({
  url: z.string().url().describe('URL of audio file to identify (MP3, WAV, OGG, etc.). The API analyzes the audio and matches it against 80M+ tracks. Example: "https://example.com/song.mp3"'),
}).strip();

const lyrics = z.object({
  q: z.string().min(1).describe('Search query for lyrics — artist name, song title, or both (e.g. "imagine john lennon", "bohemian rhapsody", "taylor swift love story")'),
}).strip();

export const auddSchemas: Record<string, ZodSchema> = {
  'audd.recognize': recognize,
  'audd.lyrics': lyrics,
};
