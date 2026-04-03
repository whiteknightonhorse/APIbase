import { z, type ZodSchema } from 'zod';

const packageInfo = z
  .object({
    package: z
      .string()
      .min(1)
      .describe('npm package name (e.g. express, react, @anthropic-ai/sdk)'),
    version: z
      .string()
      .optional()
      .describe('Specific version to fetch (e.g. 5.2.1). Defaults to latest'),
  })
  .strip();

const downloads = z
  .object({
    package: z.string().min(1).describe('npm package name (e.g. express, lodash, typescript)'),
    period: z
      .enum(['last-day', 'last-week', 'last-month', 'last-year'])
      .optional()
      .describe('Time period for download stats (default: last-week)'),
  })
  .strip();

const search = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('Search query (e.g. "mcp server", "react hooks", "typescript orm")'),
    size: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of results to return (1-20, default 10)'),
  })
  .strip();

const versions = z
  .object({
    package: z
      .string()
      .min(1)
      .describe('npm package name to list all versions (e.g. express, react)'),
  })
  .strip();

export const npmSchemas: Record<string, ZodSchema> = {
  'npm.package_info': packageInfo,
  'npm.downloads': downloads,
  'npm.search': search,
  'npm.versions': versions,
};
