import { z } from 'zod';
import type { ZodSchema } from 'zod';

/**
 * Zod schemas for NIST National Vulnerability Database (NVD) tools (UC-413).
 *
 * All fields have .describe() per Smithery quality requirements.
 * All schemas use .strip() per convention.
 */
export const nvdSchemas: Record<string, ZodSchema> = {
  'nvd.cve_search': z
    .object({
      keyword: z
        .string()
        .optional()
        .describe(
          "Free-text keyword to search CVE records. Examples: 'log4j', 'OpenSSL CVE-2023', 'Linux kernel use-after-free'. Combined with other filters using AND logic.",
        ),
      cvss_v3_severity: z
        .enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
        .optional()
        .describe(
          'Filter by CVSS v3 base severity. LOW = 0.1–3.9, MEDIUM = 4.0–6.9, HIGH = 7.0–8.9, CRITICAL = 9.0–10.0. Omit to return all severities.',
        ),
      pub_start_date: z
        .string()
        .optional()
        .describe(
          "Earliest CVE publication date in ISO 8601 extended format with timezone offset (e.g. '2024-01-01T00:00:00.000+00:00'). Maximum 120-day window per request when combined with pub_end_date.",
        ),
      pub_end_date: z
        .string()
        .optional()
        .describe(
          "Latest CVE publication date in ISO 8601 extended format with timezone offset (e.g. '2024-12-31T23:59:59.999+00:00'). Must be paired with pub_start_date. Maximum 120-day window.",
        ),
      results_per_page: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe('Number of CVE records to return per page. Range: 1–2000. Default: 20.'),
      start_index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Zero-based offset for pagination. Use with results_per_page to page through large result sets. Default: 0.',
        ),
    })
    .strip()
    .describe('Search NVD CVE records by keyword, severity, or date range.'),

  'nvd.cve_detail': z
    .object({
      cve_id: z
        .string()
        .describe(
          "Full CVE identifier in canonical form (e.g. 'CVE-2021-44228' for Log4Shell). Format: CVE-YYYY-NNNN+ where YYYY is the year and NNNN+ is a sequence number of four or more digits.",
        ),
    })
    .strip()
    .describe('Fetch the canonical NVD record for a single CVE by its ID.'),

  'nvd.cpe_search': z
    .object({
      keyword: z
        .string()
        .describe(
          "Product keyword to search the CPE dictionary. Examples: 'openssl', 'apache tomcat', 'nginx 1.18'. Returns CPE 2.3 URIs used to identify affected products in CVE records.",
        ),
      results_per_page: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('Number of CPE records to return per page. Range: 1–1000. Default: 20.'),
      start_index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Zero-based offset for pagination. Use with results_per_page to page through large result sets. Default: 0.',
        ),
    })
    .strip()
    .describe('Search the CPE dictionary to find product identifiers used in CVE configurations.'),
};
