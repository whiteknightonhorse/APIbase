import { z, type ZodSchema } from 'zod';

const models = z
  .object({
    search: z
      .string()
      .min(1)
      .describe(
        'Search query — model name or keyword (e.g. "llama", "stable-diffusion", "whisper")',
      ),
    task: z
      .string()
      .optional()
      .describe(
        'Filter by ML task: text-generation, image-classification, translation, text-to-image, automatic-speech-recognition, etc.',
      ),
    library: z
      .string()
      .optional()
      .describe('Filter by framework: transformers, diffusers, sentence-transformers, gguf, etc.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of results (1-20, default 10)'),
  })
  .strip();

const modelDetails = z
  .object({
    model_id: z
      .string()
      .min(1)
      .describe(
        'Full model ID (e.g. "meta-llama/Llama-3.3-70B-Instruct", "stabilityai/stable-diffusion-xl-base-1.0")',
      ),
  })
  .strip();

const datasets = z
  .object({
    search: z
      .string()
      .min(1)
      .describe('Search query — dataset name or keyword (e.g. "wikipedia", "imagenet", "squad")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of results (1-20, default 10)'),
  })
  .strip();

export const hfSchemas: Record<string, ZodSchema> = {
  'hf.models': models,
  'hf.model_details': modelDetails,
  'hf.datasets': datasets,
};
