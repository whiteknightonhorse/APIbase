import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// sec-edgar.company_lookup — resolve a ticker/company name to a CIK
// ---------------------------------------------------------------------------

const secEdgarCompanyLookup = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Ticker symbol (exact match, e.g. "AAPL") or company name substring (e.g. "Apple") to search for.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Maximum number of matching companies to return, 1-25 (default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// sec-edgar.filings — recent SEC filings + basic entity profile for a company
// ---------------------------------------------------------------------------

const secEdgarFilings = z
  .object({
    cik: z
      .string()
      .min(1)
      .describe(
        'SEC Central Index Key for the company, e.g. "320193" or "0000320193". Obtained from sec-edgar.company_lookup.',
      ),
    form_type: z
      .string()
      .optional()
      .describe('Filter by SEC form type, e.g. "10-K", "10-Q", "8-K", "4" (case-insensitive).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of filings to return, 1-50 (default 10, most recent first).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// sec-edgar.financial_concept — a single XBRL financial concept time series
// ---------------------------------------------------------------------------

const secEdgarFinancialConcept = z
  .object({
    cik: z
      .string()
      .min(1)
      .describe(
        'SEC Central Index Key for the company, e.g. "320193" or "0000320193". Obtained from sec-edgar.company_lookup.',
      ),
    tag: z
      .string()
      .min(1)
      .describe(
        'XBRL concept tag name, e.g. "Assets", "Liabilities", "Revenues", "NetIncomeLoss", ' +
          '"StockholdersEquity", "CashAndCashEquivalentsAtCarryingValue", "EarningsPerShareBasic".',
      ),
    taxonomy: z
      .enum(['us-gaap', 'dei'])
      .optional()
      .describe(
        'XBRL taxonomy the tag belongs to — "us-gaap" for financial statement concepts (default), ' +
          '"dei" for document/entity metadata like EntityCommonStockSharesOutstanding.',
      ),
    unit: z
      .string()
      .optional()
      .describe(
        'Unit of measure to filter by, e.g. "USD" or "shares" (default: USD if available).',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe(
        'Maximum number of reported values to return, 1-100 (default 20, most recent first).',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const secEdgarSchemas: Record<string, ZodSchema> = {
  'sec-edgar.company_lookup': secEdgarCompanyLookup,
  'sec-edgar.filings': secEdgarFilings,
  'sec-edgar.financial_concept': secEdgarFinancialConcept,
};
