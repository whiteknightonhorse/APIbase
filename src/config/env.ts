import { z } from 'zod';

/**
 * Zod schema for all environment variables (§12.238).
 *
 * Split into:
 *  - appEnvSchema  — vars consumed by the Node.js processes (API, Worker, Outbox)
 *  - infraEnvSchema — vars consumed only by Docker / sidecar containers
 *
 * Only appEnvSchema is validated at process startup.
 * infraEnvSchema is documented here for completeness but NOT loaded at runtime
 * (those vars are consumed by Postgres, Grafana, Alertmanager containers directly).
 */

// ---------------------------------------------------------------------------
// App-level env vars (validated at startup)
// ---------------------------------------------------------------------------
export const appEnvSchema = z.object({
  // Core
  NODE_ENV: z.enum(['production', 'development', 'test']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Database — per-process connection strings with pool limits (§12.215)
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_WORKER: z.string().min(1),
  DATABASE_URL_OUTBOX: z.string().min(1),

  // Redis (§12.214)
  REDIS_URL: z.string().min(1).default('redis://redis:6379'),

  // API key hashing salt — minimum 32 chars (§12.60)
  API_KEY_SECRET: z.string().min(32),

  // x402 payments (§8.6–8.9)
  X402_NETWORK: z.string().min(1).default('base'),
  X402_PAYMENT_ADDRESS: z.string().min(1).default('0x0000000000000000000000000000000000000000'),
  X402_FACILITATOR_URL: z.string().url().default('https://facilitator.payai.network'),

  // Provider API keys (§5.3)
  PROVIDER_KEY_OPENWEATHER: z.string().min(1),
  PROVIDER_KEY_COINGECKO: z.string().optional().default(''),
  PROVIDER_KEY_POLYMARKET: z.string().optional().default(''),
  PROVIDER_KEY_AVIASALES: z.string().optional().default(''),

  // Sabre GDS (UC-023) — OAuth2 client credentials
  SABRE_CLIENT_ID: z.string().optional().default(''),
  SABRE_CLIENT_SECRET: z.string().optional().default(''),

  // Amadeus Travel APIs (UC-022) — OAuth2 client credentials
  AMADEUS_API_KEY: z.string().optional().default(''),
  AMADEUS_API_SECRET: z.string().optional().default(''),

  // Foursquare Places API (UC-003) — Service API Key (Bearer auth)
  PROVIDER_KEY_FOURSQUARE: z.string().optional().default(''),

  // Ticketmaster Discovery API (UC-008) — Consumer Key (query param auth)
  PROVIDER_KEY_TICKETMASTER: z.string().optional().default(''),

  // TMDB (UC-010) — v4 Read Access Token (Bearer auth)
  TMDB_ACCESS_TOKEN: z.string().optional().default(''),

  // Health & Nutrition (UC-011) — USDA FoodData Central + OpenFDA
  PROVIDER_KEY_USDA: z.string().optional().default(''),
  PROVIDER_KEY_OPENFDA: z.string().optional().default(''),

  // Finance / Banking (UC-016) — FRED API key (free at fred.stlouisfed.org)
  PROVIDER_KEY_FRED: z.string().optional().default(''),

  // Jobs / Career Intelligence (UC-015) — O*NET, BLS, CareerJet API keys
  PROVIDER_KEY_ONET: z.string().optional().default(''),
  PROVIDER_KEY_BLS: z.string().optional().default(''),
  PROVIDER_KEY_CAREERJET: z.string().optional().default(''),

  // Education / Academic Research (UC-017) — College Scorecard + PubMed (optional)
  PROVIDER_KEY_SCORECARD: z.string().optional().default(''),
  PROVIDER_KEY_PUBMED: z.string().optional().default(''),

  // Maps / Geolocation (UC-012) — Geoapify (OSM-based, free tier 3K credits/day)
  PROVIDER_KEY_GEOAPIFY: z.string().optional().default(''),

  // AIPush AI Marketing (UC-019) — internal service-to-service
  AIPUSH_INTERNAL_SECRET: z.string().optional().default(''),
  AIPUSH_INTERNAL_URL: z.string().optional().default('http://172.17.0.1:3000'),

  // Diffbot AI Extraction (UC-026) — query param auth, 10K free/month
  PROVIDER_KEY_DIFFBOT: z.string().optional().default(''),

  // WhoisXML API (UC-028) — query param auth, 500 free queries
  PROVIDER_KEY_WHOISXML: z.string().optional().default(''),

  // Spoonacular Recipe API (UC-031) — query param auth, 150 points/day free
  PROVIDER_KEY_SPOONACULAR: z.string().optional().default(''),

  // NASA Open APIs (UC-034) — query param auth, 1K req/hour free
  PROVIDER_KEY_NASA: z.string().optional().default(''),

  // RAWG Video Games Database (UC-037) — query param auth, unlimited free
  PROVIDER_KEY_RAWG: z.string().optional().default(''),

  // IGDB Video Games Database (UC-039) — OAuth2 Twitch Client Credentials, unlimited free
  IGDB_CLIENT_ID: z.string().optional().default(''),
  IGDB_CLIENT_SECRET: z.string().optional().default(''),

  // ZeroBounce Email Validation (UC-055) — query param auth, 100 free/month, $39/2K credits
  PROVIDER_KEY_ZEROBOUNCE: z.string().optional().default(''),

  // Twilio SMS (UC-086) — Account SID + Auth Token, trial $15.50
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),

  // Stability AI (UC-080) — Bearer header, 25 free credits
  PROVIDER_KEY_STABILITY: z.string().optional().default(''),

  // Resend Email (UC-076) — Bearer header, 3K/month free
  PROVIDER_KEY_RESEND: z.string().optional().default(''),

  // OCR.space (UC-078) — apikey header, 25K req/month free, commercial OK
  PROVIDER_KEY_OCRSPACE: z.string().optional().default(''),

  // Finnhub Stock Market (UC-074) — token query param, 60 req/min free
  PROVIDER_KEY_FINNHUB: z.string().optional().default(''),

  // NewsData.io (UC-070) — apikey query param, 200 credits/day free, commercial OK
  PROVIDER_KEY_NEWSDATA: z.string().optional().default(''),

  // Short.io URL Shortener (UC-112) — Bearer header, 1K links/mo free
  PROVIDER_KEY_SHORTIO: z.string().optional().default(''),

  // ExchangeRate-API (UC-115) — key in URL, 1,500/mo free
  PROVIDER_KEY_EXCHANGERATE: z.string().optional().default(''),

  // Calendarific (UC-111) — api_key query param, 500/mo free
  PROVIDER_KEY_CALENDARIFIC: z.string().optional().default(''),

  // NASA FIRMS (UC-108) — MAP_KEY, 5K tx/10min
  PROVIDER_KEY_FIRMS: z.string().optional().default(''),

  // ApiFlash Screenshot (UC-093) — access_key query param, 100/month free
  PROVIDER_KEY_APIFLASH: z.string().optional().default(''),

  // API-Sports (UC-089) — x-apisports-key header, 100 req/day per sport
  PROVIDER_KEY_APISPORTS: z.string().optional().default(''),

  // Langbly Translation (UC-087) — Bearer header, 500K chars/mo free
  PROVIDER_KEY_LANGBLY: z.string().optional().default(''),

  // Exa Semantic Search (UC-069) — x-api-key header, 1,000 req/month free
  PROVIDER_KEY_EXA: z.string().optional().default(''),

  // Tavily AI Search (UC-068) — api_key in body, 1,000 credits/month free
  PROVIDER_KEY_TAVILY: z.string().optional().default(''),

  // Serper.dev Google Search (UC-067) — X-API-KEY header, 2,500 free one-time, PAYG $0.001/call
  PROVIDER_KEY_SERPER: z.string().optional().default(''),

  // US Real Estate via RapidAPI (UC-063) — header auth, 500K req/month free BASIC plan
  PROVIDER_KEY_RAPIDAPI: z.string().optional().default(''),

  // Walk Score (UC-062) — query param auth, 5,000 calls/day free
  PROVIDER_KEY_WALKSCORE: z.string().optional().default(''),

  // IQAir AirVisual (UC-120) — query param auth, 10,000 calls/month free
  PROVIDER_KEY_IQAIR: z.string().optional().default(''),

  // PodcastIndex (UC-141) — HMAC-SHA1 auth, fully free
  PROVIDER_KEY_PODCASTINDEX: z.string().optional().default(''),
  PROVIDER_SECRET_PODCASTINDEX: z.string().optional().default(''),

  // Geocodio (UC-131) — query param auth, 2,500 lookups/day free
  PROVIDER_KEY_GEOCODIO: z.string().optional().default(''),

  // Auto.dev (UC-127) — query param auth, 1,000 calls/month free
  PROVIDER_KEY_AUTODEV: z.string().optional().default(''),

  // Hunter.io (UC-128) — query param auth, 50 credits/month free
  PROVIDER_KEY_HUNTER: z.string().optional().default(''),

  // FatSecret (UC-126) — OAuth 2.0 client credentials, 5,000 calls/day free
  FATSECRET_CLIENT_ID: z.string().optional().default(''),
  FATSECRET_CLIENT_SECRET: z.string().optional().default(''),

  // Polymarket trading — Phase 2 (UC-001 §3-§8)
  POLYMARKET_WALLET_ADDRESS: z.string().startsWith('0x').optional().default(''),
  POLYMARKET_PRIVATE_KEY: z.string().optional().default(''),
  POLYMARKET_BUILDER_API_KEY: z.string().optional().default(''),
  POLYMARKET_BUILDER_SECRET: z.string().optional().default(''),
  POLYMARKET_BUILDER_PASSPHRASE: z.string().optional().default(''),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

// ---------------------------------------------------------------------------
// Infrastructure env vars (NOT validated by Node — consumed by containers)
// Documented here so the registry (§12.238) lives in one place.
// ---------------------------------------------------------------------------
export const infraEnvSchema = z.object({
  IMAGE_TAG: z.string().default('latest'),
  POSTGRES_USER: z.string().default('apibase'),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().default('apibase'),
  PG_PASSWORD: z.string().min(1),
  GF_ADMIN_PASSWORD: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
});

export type InfraEnv = z.infer<typeof infraEnvSchema>;
