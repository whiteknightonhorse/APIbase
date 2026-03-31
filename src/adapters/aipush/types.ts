/**
 * AIPush adapter response types (UC-019).
 *
 * Internal API responses from AIPush service.
 * AIPush generates AI-optimized marketing pages for websites.
 */

// ---------------------------------------------------------------------------
// POST /api/internal/setup
// ---------------------------------------------------------------------------

export interface AIPushSetupResponse {
  client_id: string;
  mip_status: string;
  dns_verified: boolean;
  ssl_status: string;
  message: string;
}

// ---------------------------------------------------------------------------
// GET /api/internal/status/:domain
// ---------------------------------------------------------------------------

export interface AIPushStatusResponse {
  client_id: string;
  website_domain: string;
  target_url: string;
  mip_status: string;
  dns_verified: boolean;
  cf_hostname_status: string;
  cf_ssl_status: string;
  billing_status: string;
  pages_total: number;
  pages_today: number;
  subscription_expires_at: string | null;
}

// ---------------------------------------------------------------------------
// POST /api/internal/generate
// ---------------------------------------------------------------------------

export interface AIPushGenerateResponse {
  slug: string;
  title: string;
  canonical_url: string;
  content_sha256: string;
  published_at: string;
}

// ---------------------------------------------------------------------------
// GET /api/internal/pages/:domain
// ---------------------------------------------------------------------------

export interface AIPushPageEntry {
  slug: string;
  title: string;
  canonical_url: string;
  published_at: string;
}

export interface AIPushPagesResponse {
  pages: AIPushPageEntry[];
  total: number;
}

// ---------------------------------------------------------------------------
// GET /api/internal/page/:domain/:slug
// ---------------------------------------------------------------------------

export interface AIPushPageContentResponse {
  slug: string;
  title: string;
  canonical_url: string;
  html_content: string;
  content_sha256: string;
  published_at: string;
}

// ---------------------------------------------------------------------------
// GET /api/internal/profile/:domain
// ---------------------------------------------------------------------------

export interface AIPushProfileResponse {
  business_name: string;
  category: string;
  location: string;
  competitors: unknown[];
  value_props: unknown[];
  market_surface: unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// POST /api/internal/visibility
// ---------------------------------------------------------------------------

export interface AIPushVisibilityResponse {
  scores: Record<string, number>;
  overall_score: number;
  checked_at: string;
}

// ---------------------------------------------------------------------------
// POST /api/internal/market-report
// ---------------------------------------------------------------------------

export interface AIPushMarketReportResponse {
  ok: boolean;
  report_id: string;
  status: string;
}

// ---------------------------------------------------------------------------
// GET /api/internal/market-report/:id
// ---------------------------------------------------------------------------

export interface AIPushMarketReportStatusResponse {
  ok: boolean;
  report_id: string;
  status: string; // running | completed | failed
  step?: string; // crawling | ai_analysis | ...
  started_at?: string;
  completed_at?: string;
  target_url?: string;
  profile_json?: Record<string, unknown>;
  error?: string;
}
