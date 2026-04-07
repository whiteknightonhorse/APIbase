import { z, type ZodSchema } from 'zod';

const systemEnum = z
  .enum(['npm', 'pypi', 'go', 'maven', 'cargo', 'nuget'])
  .describe('Package ecosystem: npm, pypi, go, maven, cargo, or nuget');

const packageInfo = z
  .object({
    system: systemEnum,
    package: z
      .string()
      .min(1)
      .describe('Package name (e.g. express, requests, gin-gonic/gin, log4j-core)'),
  })
  .strip();

const dependencies = z
  .object({
    system: systemEnum,
    package: z
      .string()
      .min(1)
      .describe('Package name (e.g. lodash, flask, github.com/gin-gonic/gin)'),
    version: z
      .string()
      .min(1)
      .describe('Package version to resolve dependencies for (e.g. 4.17.21, 3.0.0)'),
  })
  .strip();

const advisories = z
  .object({
    system: systemEnum,
    package: z.string().min(1).describe('Package name to check for security advisories'),
    version: z.string().min(1).describe('Package version to check (e.g. 4.17.20)'),
  })
  .strip();

export const depsdevSchemas: Record<string, ZodSchema> = {
  'depsdev.package': packageInfo,
  'depsdev.dependencies': dependencies,
  'depsdev.advisories': advisories,
};
