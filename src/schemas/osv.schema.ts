import { z, type ZodSchema } from 'zod';

const ecosystems = z
  .enum([
    'npm',
    'PyPI',
    'Go',
    'Maven',
    'crates.io',
    'NuGet',
    'Packagist',
    'RubyGems',
    'Pub',
    'Hex',
    'SwiftURL',
    'Linux',
    'Android',
    'OSS-Fuzz',
    'GIT',
  ])
  .describe(
    'Package ecosystem (npm, PyPI, Go, Maven, crates.io, NuGet, Packagist, RubyGems, etc.)',
  );

const query = z
  .object({
    package: z.string().min(1).describe('Package name (e.g. lodash, requests, gin-gonic/gin)'),
    version: z.string().min(1).describe('Package version to check (e.g. 4.17.20, 2.25.0)'),
    ecosystem: ecosystems,
  })
  .strip();

const get = z
  .object({
    vuln_id: z
      .string()
      .min(1)
      .describe(
        'Vulnerability ID — OSV (e.g. GHSA-35jh-r3h4-6jhm), CVE (e.g. CVE-2021-23337), or PYSEC/GO/RUSTSEC ID',
      ),
  })
  .strip();

const batchQuery = z
  .object({
    queries: z
      .array(
        z
          .object({
            package: z.string().min(1).describe('Package name'),
            version: z.string().min(1).describe('Package version'),
            ecosystem: ecosystems,
          })
          .strip(),
      )
      .min(1)
      .max(100)
      .describe('List of package+version+ecosystem to check (max 100)'),
  })
  .strip();

export const osvSchemas: Record<string, ZodSchema> = {
  'osv.query': query,
  'osv.get': get,
  'osv.batch_query': batchQuery,
};
