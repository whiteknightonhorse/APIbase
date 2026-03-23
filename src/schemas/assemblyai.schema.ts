import { z, type ZodSchema } from 'zod';

const submit = z.object({
  audio_url: z.string().url().describe('Publicly accessible URL of the audio file to transcribe (MP3, WAV, M4A, FLAC, OGG, WebM)'),
  model: z.enum(['universal-2', 'universal-3-pro']).optional().describe('Speech model: "universal-2" (default, fast, 99 languages) or "universal-3-pro" (highest accuracy, promptable)'),
  language_code: z.string().optional().describe('Language code (e.g. "en", "es", "de", "fr", "ja"). Auto-detected if omitted'),
  speaker_labels: z.boolean().optional().describe('Enable speaker diarization — detect who said what (default false)'),
}).strip();

const status = z.object({
  transcript_id: z.string().describe('Transcript ID returned from transcribe.submit (e.g. "aa8f42b3-e81e-453a-b010-a074ae76403b")'),
}).strip();

const result = z.object({
  transcript_id: z.string().describe('Transcript ID to get the completed transcription text for'),
}).strip();

export const assemblyaiSchemas: Record<string, ZodSchema> = {
  'transcribe.submit': submit,
  'transcribe.status': status,
  'transcribe.result': result,
};
