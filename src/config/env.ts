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

  // AssemblyAI (UC-179) — speech-to-text, $50 free credits
  PROVIDER_KEY_ASSEMBLYAI: z.string().optional().default(''),

  // Companies House (UC-174) — UK company registry, Basic Auth
  PROVIDER_KEY_COMPANIES_HOUSE: z.string().optional().default(''),

  // Bluesky (UC-171) — AT Protocol, app-password auth
  BLUESKY_HANDLE: z.string().optional().default(''),
  BLUESKY_APP_PASSWORD: z.string().optional().default(''),

  // NameSilo (UC-202) — domain registration, pre-funded balance
  PROVIDER_KEY_NAMESILO: z.string().optional().default(''),

  // Pexels (UC-207) — stock photos & videos
  PROVIDER_KEY_PEXELS: z.string().optional().default(''),

  // Browserbase (UC-205) — managed browser sessions
  BROWSERBASE_API_KEY: z.string().optional().default(''),
  BROWSERBASE_PROJECT_ID: z.string().optional().default(''),

  // Telegram Bot API (UC-204) — messaging, unlimited free
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),

  // Cloudflare (UC-201) — DNS, CDN, infrastructure management
  CLOUDFLARE_API_KEY: z.string().optional().default(''),
  CLOUDFLARE_EMAIL: z.string().optional().default(''),

  // Europeana (UC-161) — EU cultural heritage, unlimited free
  PROVIDER_KEY_EUROPEANA: z.string().optional().default(''),

  // ConvertAPI (UC-148) — file conversion, 250 free conversions
  PROVIDER_KEY_CONVERTAPI: z.string().optional().default(''),

  // API2PDF (UC-146) — PDF generation, $1 starting balance
  PROVIDER_KEY_API2PDF: z.string().optional().default(''),

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

  // BallDontLie Sports (UC-251) — Authorization header, $0/sport free
  PROVIDER_KEY_BDL: z.string().optional().default(''),

  // Adzuna Job Search (UC-253) — app_id+app_key query params, Trial free
  ADZUNA_APP_ID: z.string().optional().default(''),
  ADZUNA_APP_KEY: z.string().optional().default(''),

  // DHL Shipment Tracking (UC-228) — DHL-API-Key header, 250 req/day production
  PROVIDER_KEY_DHL: z.string().optional().default(''),

  // ShipEngine (UC-246) — API-Key header, Free plan $0/mo
  PROVIDER_KEY_SHIPENGINE: z.string().optional().default(''),

  // WeatherAPI.com (UC-243) — key= query param, 10M calls/month Business trial
  PROVIDER_KEY_WEATHERAPI: z.string().optional().default(''),

  // Zyte API Web Scraping (UC-233) — Basic Auth, $5 free credit trial
  PROVIDER_KEY_ZYTE: z.string().optional().default(''),

  // MarketCheck Car Listings (UC-231) — api_key query param, 500 free/month
  PROVIDER_KEY_MARKETCHECK: z.string().optional().default(''),

  // Threat Intelligence Platform (UC-227) — apiKey query param, 100 free credits
  PROVIDER_KEY_THREATINTEL: z.string().optional().default(''),

  // Listen Notes Podcast Search (UC-225) — X-ListenAPI-Key header, 50 free/month
  PROVIDER_KEY_LISTENNOTES: z.string().optional().default(''),

  // AudD Music Recognition (UC-226) — api_token query param, 300 free trial
  PROVIDER_KEY_AUDD: z.string().optional().default(''),

  // Materials Project (UC-222) — X-API-KEY header, free unlimited, CC BY 4.0
  PROVIDER_KEY_MATERIALS_PROJECT: z.string().optional().default(''),

  // 17TRACK Package Tracking (UC-221) — 17token header, 200 free registers/month
  PROVIDER_KEY_17TRACK: z.string().optional().default(''),

  // TheirStack Job Market Intelligence (UC-254) — Bearer JWT, 200 credits/month free
  PROVIDER_KEY_THEIRSTACK: z.string().optional().default(''),

  // Jooble Job Aggregator (UC-255) — API key in URL path, 500 requests default
  PROVIDER_KEY_JOOBLE: z.string().optional().default(''),

  // Tempo MPP — Machine Payments Protocol (dual-rail with x402)
  MPP_ENABLED: z.string().optional().default('false'),
  MPP_SECRET_KEY: z.string().optional().default(''),
  TEMPO_WALLET_ADDRESS: z.string().optional().default(''),
  MPP_REALM: z.string().optional().default('apibase.pro'),
  MPP_TESTNET: z.string().optional().default('false'),

  // RateAPI (UC-197) — MCP-native US lending rates
  PROVIDER_KEY_RATEAPI: z.string().optional().default(''),

  // TwitterAPI.io (UC-198) — Twitter/X data, pay-per-call
  PROVIDER_KEY_TWITTERAPI: z.string().optional().default(''),

  // Currents API (UC-210) — global news 70+ countries
  PROVIDER_KEY_CURRENTS: z.string().optional().default(''),

  // IBANAPI (UC-212) — IBAN validation + bank identification
  PROVIDER_KEY_IBANAPI: z.string().optional().default(''),

  // PubChem / NCBI (UC-213) — optional, raises rate limit from 5 to 10 req/sec
  PROVIDER_KEY_NCBI: z.string().optional().default(''),

  // Open Charge Map (UC-214) — EV charging stations, unlimited free
  PROVIDER_KEY_OPENCHARGEMAP: z.string().optional().default(''),

  // IPQualityScore (UC-217) — fraud detection, 1K lookups/month free
  PROVIDER_KEY_IPQS: z.string().optional().default(''),

  // Predictive Pre-fetching (F8) — fire-and-forget cache warming
  PREFETCH_ENABLED: z.string().optional().default('false'),

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
