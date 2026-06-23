import { z, type ZodSchema } from 'zod';

const peopleSearch = z
  .object({
    jurisdiction: z
      .string()
      .optional()
      .describe(
        'State or jurisdiction abbreviation to filter legislators (e.g. "ca" for California, "tx" for Texas, "ny" for New York). Required unless name is provided.',
      ),
    name: z
      .string()
      .optional()
      .describe(
        'Search legislators by full or partial name (e.g. "Pelosi", "Nancy Pelosi"). Case-insensitive substring match.',
      ),
    party: z
      .string()
      .optional()
      .describe(
        'Filter by political party affiliation (e.g. "Democratic", "Republican", "Independent").',
      ),
    district: z
      .string()
      .optional()
      .describe('Filter by legislative district number or name (e.g. "12", "Senate District 5").'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results per page (1–50, default 20).'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
  })
  .strip();

const billsSearch = z
  .object({
    jurisdiction: z
      .string()
      .optional()
      .describe(
        'State or jurisdiction abbreviation to search bills in (e.g. "ca", "tx", "ny"). Required unless q is provided.',
      ),
    q: z
      .string()
      .optional()
      .describe(
        'Full-text keyword search across bill titles and text (e.g. "climate change", "education funding").',
      ),
    session: z
      .string()
      .optional()
      .describe(
        'Legislative session identifier to filter bills (e.g. "20252026" for 2025-2026 session). Format varies by state.',
      ),
    classification: z
      .string()
      .optional()
      .describe(
        'Filter by bill type classification (e.g. "bill", "resolution", "joint resolution", "concurrent resolution").',
      ),
    subject: z
      .string()
      .optional()
      .describe(
        'Filter by subject/topic tag assigned to the bill (e.g. "Education", "Environment", "Health Care").',
      ),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results per page (1–50, default 20).'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
  })
  .strip();

const billDetail = z
  .object({
    jurisdiction: z
      .string()
      .describe(
        'State abbreviation where the bill was introduced (e.g. "ca" for California, "ny" for New York).',
      ),
    session: z
      .string()
      .describe(
        'Legislative session identifier the bill belongs to (e.g. "20252026", "2024"). Obtain from bills_search results.',
      ),
    bill_id: z
      .string()
      .describe(
        'Bill identifier within the session (e.g. "SB 700", "HB 1234", "SR 5"). Obtain from bills_search results.',
      ),
  })
  .strip();

const committees = z
  .object({
    jurisdiction: z
      .string()
      .optional()
      .describe(
        'State or jurisdiction abbreviation to list committees for (e.g. "ca", "tx", "ny").',
      ),
    chamber: z
      .string()
      .optional()
      .describe(
        'Filter by chamber (e.g. "upper" for Senate, "lower" for House/Assembly, "legislature" for joint committees).',
      ),
    classification: z
      .string()
      .optional()
      .describe('Filter by committee classification (e.g. "committee", "subcommittee").'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results per page (1–50, default 20).'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
  })
  .strip();

export const openstatesSchemas: Record<string, ZodSchema> = {
  'openstates.people_search': peopleSearch,
  'openstates.bills_search': billsSearch,
  'openstates.bill_detail': billDetail,
  'openstates.committees': committees,
};
