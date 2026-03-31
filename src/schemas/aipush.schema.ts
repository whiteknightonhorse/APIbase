import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// aipush.setup_website — Register website + trigger MIP analysis
// ---------------------------------------------------------------------------

const aipushSetupWebsite = z
  .object({
    website_domain: z
      .string()
      .min(3)
      .max(253)
      .describe(
        'Domain of the website to register (e.g. "example.com", "myhotel.com"). Must have a CNAME record: reference.{domain} → cname.aipush.app',
      ),
    target_url: z
      .string()
      .url()
      .max(2048)
      .describe(
        'Target conversion URL — the single page all generated content will link to (e.g. "https://example.com/book", "https://myhotel.com/reserve"). Must be on the same domain.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// aipush.website_status — Check MIP/DNS/SSL/generation status
// ---------------------------------------------------------------------------

const aipushWebsiteStatus = z
  .object({
    website_domain: z
      .string()
      .min(3)
      .max(253)
      .describe('Domain to check status for (e.g. "example.com").'),
  })
  .strip();

// ---------------------------------------------------------------------------
// aipush.generate_page — Generate one AI-optimized marketing page
// ---------------------------------------------------------------------------

const aipushGeneratePage = z
  .object({
    website_domain: z
      .string()
      .min(3)
      .max(253)
      .describe(
        'Domain of the website to generate a page for. Must be set up first via aipush.setup_website.',
      ),
    keyword: z
      .string()
      .min(2)
      .max(200)
      .optional()
      .describe(
        'Target keyword or topic for the page (e.g. "best hotels in Bangkok", "affordable dentist near me"). If omitted, the system picks from the semantic coverage grid.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// aipush.list_pages — List all published pages for a website
// ---------------------------------------------------------------------------

const aipushListPages = z
  .object({
    website_domain: z
      .string()
      .min(3)
      .max(253)
      .describe('Domain to list pages for (e.g. "example.com").'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of pages to return (default 20, max 100).'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of pages to skip for pagination (default 0).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// aipush.page_content — Get full HTML content of a specific page
// ---------------------------------------------------------------------------

const aipushPageContent = z
  .object({
    website_domain: z
      .string()
      .min(3)
      .max(253)
      .describe('Domain the page belongs to (e.g. "example.com").'),
    slug: z
      .string()
      .min(1)
      .max(200)
      .describe(
        'Page slug identifier (e.g. "best-hotels-bangkok-2026"). Returned by aipush.list_pages or aipush.generate_page.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// aipush.website_profile — Get MIP business analysis results
// ---------------------------------------------------------------------------

const aipushWebsiteProfile = z
  .object({
    website_domain: z
      .string()
      .min(3)
      .max(253)
      .describe(
        'Domain to get the MIP business analysis for. Must have completed setup (mip_status = "ready").',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// aipush.check_visibility — AI visibility score for a brand
// ---------------------------------------------------------------------------

const aipushCheckVisibility = z
  .object({
    website_domain: z
      .string()
      .min(3)
      .max(253)
      .describe(
        'Domain to check AI visibility for (e.g. "example.com"). Tests whether AI assistants know about and recommend this brand.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// aipush.market_report — Start MIP Market Intelligence Report
// ---------------------------------------------------------------------------

const aipushMarketReport = z
  .object({
    target_url: z
      .string()
      .url()
      .describe(
        'Website URL to analyze (e.g. "https://stripe.com"). The system crawls the site, extracts value propositions, finds competitors, and builds a full market intelligence report with competitive scoring, keyword gaps, and market opportunities. Takes ~2 minutes.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// aipush.market_report_status — Poll report status / get results
// ---------------------------------------------------------------------------

const aipushMarketReportStatus = z
  .object({
    report_id: z
      .string()
      .uuid()
      .describe(
        'Report ID in UUID format (e.g. "ed90f49c-15d8-46ee-9799-c6a8d468f6ba") — returned by aipush.market_report. Poll until status = "completed" to get full profile_json with competitors, keywords, and market analysis.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const aipushSchemas: Record<string, ZodSchema> = {
  'aipush.setup_website': aipushSetupWebsite,
  'aipush.website_status': aipushWebsiteStatus,
  'aipush.generate_page': aipushGeneratePage,
  'aipush.list_pages': aipushListPages,
  'aipush.page_content': aipushPageContent,
  'aipush.website_profile': aipushWebsiteProfile,
  'aipush.check_visibility': aipushCheckVisibility,
  'aipush.market_report': aipushMarketReport,
  'aipush.market_report_status': aipushMarketReportStatus,
};
