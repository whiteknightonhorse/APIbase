import { z, type ZodSchema } from 'zod';

const submit = z
  .object({
    duration_seconds: z
      .number()
      .int()
      .min(1)
      .max(14400)
      .describe(
        'Audio duration in seconds (required, max 14400 = 4 h). Billed per audio minute: max($0.01, ceil(minutes) x $0.005). The job is cut at this duration upstream, so audio longer than declared is transcribed only up to it',
      ),
    audio_url: z
      .string()
      .url()
      .describe(
        'Publicly accessible URL of the audio file to transcribe (MP3, WAV, M4A, FLAC, OGG, WebM)',
      ),
    model: z
      .enum(['universal-2', 'universal-3-pro'])
      .optional()
      .describe(
        'Speech model: "universal-2" (default, fast, 99 languages) or "universal-3-pro" (highest accuracy, promptable)',
      ),
    language_code: z
      .string()
      .optional()
      .describe('Language code (e.g. "en", "es", "de", "fr", "ja"). Auto-detected if omitted'),
    speaker_labels: z
      .boolean()
      .optional()
      .describe('Enable speaker diarization — detect who said what (default false)'),
  })
  .strip();

const status = z
  .object({
    transcript_id: z
      .string()
      .describe(
        'Transcript ID returned from transcribe.submit (e.g. "aa8f42b3-e81e-453a-b010-a074ae76403b")',
      ),
  })
  .strip();

const result = z
  .object({
    transcript_id: z.string().describe('Transcript ID to get the completed transcription text for'),
  })
  .strip();

export const assemblyaiSchemas: Record<string, ZodSchema> = {
  'transcribe.submit': submit,
  'transcribe.status': status,
  'transcribe.result': result,
};
