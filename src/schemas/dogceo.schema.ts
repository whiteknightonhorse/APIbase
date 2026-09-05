import { z, type ZodSchema } from 'zod';

const randomImage = z
  .object({
    breed: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .optional()
      .describe('Filter by dog breed (e.g. "hound", "labrador"). Omit for a random breed.'),
    sub_breed: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .optional()
      .describe(
        'Filter by sub-breed within the given breed (e.g. "afghan" for breed "hound"). Requires breed to also be set.',
      ),
    count: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of random images to return (1-50, default 1)'),
  })
  .strip();

const breedsList = z
  .object({
    include_sub_breeds: z
      .boolean()
      .optional()
      .describe(
        'Include the nested sub-breeds array for each breed (default true). Set false for a flat list of breed names only.',
      ),
  })
  .strip();

const subBreeds = z
  .object({
    breed: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .describe('Dog breed to look up sub-breeds for (e.g. "bulldog", "terrier")'),
  })
  .strip();

export const dogceoSchemas: Record<string, ZodSchema> = {
  'dogceo.random_image': randomImage,
  'dogceo.breeds_list': breedsList,
  'dogceo.sub_breeds': subBreeds,
};
