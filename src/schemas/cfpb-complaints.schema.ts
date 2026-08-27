import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// Shared enums (exact CFPB taxonomy values — non-matching values return 0 results,
// not an error, so the real strings are listed verbatim for agents to copy).
// ---------------------------------------------------------------------------

const PRODUCT_DESCRIPTION =
  'Exact CFPB product category — must match verbatim, e.g. "Credit reporting or other personal ' +
  'consumer reports", "Debt collection", "Mortgage", "Checking or savings account", "Credit card", ' +
  '"Credit card or prepaid card", "Money transfer, virtual currency, or money service", "Student loan", ' +
  '"Vehicle loan or lease", "Payday loan, title loan, personal loan, or advance loan", "Prepaid card". ' +
  'A near-miss (e.g. wrong wording) silently returns 0 results rather than an error.';

const COMPANY_DESCRIPTION =
  'Exact registered company name as CFPB records it, typically uppercase with legal suffix ' +
  '(e.g. "EQUIFAX, INC.", "WELLS FARGO & COMPANY", "BANK OF AMERICA, NATIONAL ASSOCIATION"). ' +
  'A near-miss silently returns 0 results rather than an error.';

const STATE_DESCRIPTION =
  'Two-letter US state or territory postal abbreviation (e.g. "CA", "NY", "PR").';

// ---------------------------------------------------------------------------
// cfpb-complaints.search — search individual consumer complaints
// ---------------------------------------------------------------------------

const cfpbComplaintsSearch = z
  .object({
    search_term: z
      .string()
      .optional()
      .describe(
        'Full-text search query (e.g. "overdraft fee", "credit report error"). Searched against ' +
          'the field named by `field`.',
      ),
    field: z
      .enum(['complaint_what_happened', 'all'])
      .optional()
      .describe(
        'Which field `search_term` searches: "complaint_what_happened" (consumer narrative text, ' +
          'default) or "all" (all indexed text fields).',
      ),
    product: z.string().optional().describe(PRODUCT_DESCRIPTION),
    company: z.string().optional().describe(COMPANY_DESCRIPTION),
    state: z.string().length(2).optional().describe(STATE_DESCRIPTION),
    issue: z
      .string()
      .optional()
      .describe(
        'Exact CFPB issue category — must match verbatim, e.g. "Incorrect information on your ' +
          'report", "Attempts to collect debt not owed", "Managing an account", "Written notification ' +
          'about debt". A near-miss silently returns 0 results rather than an error.',
      ),
    company_response: z
      .enum([
        'Closed with explanation',
        'Closed with non-monetary relief',
        'Closed with monetary relief',
        'Closed with relief',
        'Closed without relief',
        'In progress',
        'Untimely response',
        'Closed',
      ])
      .optional()
      .describe('How the company responded to the complaint.'),
    timely: z
      .enum(['Yes', 'No'])
      .optional()
      .describe('Whether the company responded to the complaint in a timely manner.'),
    has_narrative: z
      .boolean()
      .optional()
      .describe('Only return complaints that include (true) or omit (false) a consumer narrative.'),
    date_received_min: z
      .string()
      .optional()
      .describe('Only complaints received on/after this date, format YYYY-MM-DD.'),
    date_received_max: z
      .string()
      .optional()
      .describe('Only complaints received on/before this date, format YYYY-MM-DD.'),
    size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of complaints to return, 1-100 (default 10).'),
    frm: z
      .number()
      .int()
      .min(0)
      .max(9900)
      .optional()
      .describe('Offset for pagination, i.e. skip this many results (default 0).'),
    sort: z
      .enum(['relevance_desc', 'relevance_asc', 'created_date_desc', 'created_date_asc'])
      .optional()
      .describe('Result ordering (default "created_date_desc").'),
  })
  .strip();

// ---------------------------------------------------------------------------
// cfpb-complaints.trends — complaint volume trend over time
// ---------------------------------------------------------------------------

const cfpbComplaintsTrends = z
  .object({
    lens: z
      .enum(['overview', 'product', 'issue', 'company'])
      .optional()
      .describe(
        'Trend breakdown dimension (default "overview" — total volume only, no `sub_lens` needed). ' +
          '"product"/"issue"/"company" require `sub_lens` to be set, or upstream returns a 422 listing ' +
          'the valid sub-lens choices for that lens.',
      ),
    sub_lens: z
      .enum(['sub_product', 'issue', 'sub_issue', 'company', 'tags', 'product'])
      .optional()
      .describe(
        'Secondary breakdown required when `lens` is not "overview". Valid per lens: product→' +
          '(sub_product, issue, company, tags); issue→(product, sub_issue, company, tags); company→' +
          '(product, issue, tags).',
      ),
    trend_interval: z
      .enum(['week', 'month', 'year'])
      .optional()
      .describe('Time bucket size for the trend series (default "month").'),
    date_min: z.string().optional().describe('Start of the date range, format YYYY-MM-DD.'),
    date_max: z.string().optional().describe('End of the date range, format YYYY-MM-DD.'),
    product: z.string().optional().describe(PRODUCT_DESCRIPTION),
    company: z.string().optional().describe(COMPANY_DESCRIPTION),
    state: z.string().length(2).optional().describe(STATE_DESCRIPTION),
  })
  .strip();

// ---------------------------------------------------------------------------
// cfpb-complaints.geo_states — per-state complaint aggregation
// ---------------------------------------------------------------------------

const cfpbComplaintsGeoStates = z
  .object({
    date_received_min: z
      .string()
      .optional()
      .describe('Only count complaints received on/after this date, format YYYY-MM-DD.'),
    date_received_max: z
      .string()
      .optional()
      .describe('Only count complaints received on/before this date, format YYYY-MM-DD.'),
    product: z.string().optional().describe(PRODUCT_DESCRIPTION),
    company: z.string().optional().describe(COMPANY_DESCRIPTION),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const cfpbComplaintsSchemas: Record<string, ZodSchema> = {
  'cfpb-complaints.search': cfpbComplaintsSearch,
  'cfpb-complaints.trends': cfpbComplaintsTrends,
  'cfpb-complaints.geo_states': cfpbComplaintsGeoStates,
};
