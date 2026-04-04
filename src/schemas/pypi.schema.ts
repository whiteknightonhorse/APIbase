import { z, type ZodSchema } from 'zod';

const packageInfo = z
  .object({
    package: z
      .string()
      .min(1)
      .describe('Python package name (e.g. requests, flask, numpy, anthropic)'),
    version: z
      .string()
      .optional()
      .describe('Specific version (e.g. 2.31.0). Defaults to latest release.'),
  })
  .strip();

const releases = z
  .object({
    package: z
      .string()
      .min(1)
      .describe('Python package name to list all versions (e.g. django, pandas, scipy)'),
  })
  .strip();

export const pypiSchemas: Record<string, ZodSchema> = {
  'pypi.package_info': packageInfo,
  'pypi.releases': releases,
};
