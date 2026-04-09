import { type BaseAdapter } from './base.adapter';
import { PolymarketAdapter } from './polymarket';
import { HyperliquidAdapter } from './hyperliquid';
import { AsterDexAdapter } from './asterdex';
import { OpenWeatherMapAdapter } from './openweathermap';
import { SabreAdapter } from './sabre';
import { AmadeusAdapter } from './amadeus';
import { FoursquareAdapter } from './foursquare';
import { TicketmasterAdapter } from './ticketmaster';
import { CoinGeckoAdapter } from './coingecko';
import { TmdbAdapter } from './tmdb';
import { HealthAdapter } from './health';
import { FinanceAdapter } from './finance';
import { MusicAdapter } from './music';
import { JobsAdapter } from './jobs';
import { EducationAdapter } from './education';
import { GeoAdapter } from './geo';
import { AIPushAdapter } from './aipush';
import { DiffbotAdapter } from './diffbot';
import { WhoisXmlAdapter } from './whoisxml';
import { SpoonacularAdapter } from './spoonacular';
import { NasaAdapter } from './nasa';
import { JplAdapter } from './jpl';
import { RawgAdapter } from './rawg';
import { IgdbAdapter } from './igdb';
import { QrServerAdapter } from './qrserver';
import { UpcItemDbAdapter } from './upcitemdb';
import { IpApiAdapter } from './ipapi';
import { UsgsEarthquakeAdapter } from './usgs-earthquake';
import { JikanAdapter } from './jikan';
import { OpenLibraryAdapter } from './openlibrary';
import { ZeroBounceAdapter } from './zerobounce';
import { AviasalesAdapter } from './aviasales';
import { WalkScoreAdapter } from './walkscore';
import { UsRealEstateAdapter } from './usrealestate';
import { SerperAdapter } from './serper';
import { TavilyAdapter } from './tavily';
import { ExaAdapter } from './exa';
import { NewsDataAdapter } from './newsdata';
import { FinnhubAdapter } from './finnhub';
import { OcrSpaceAdapter } from './ocrspace';
import { RegulationsAdapter } from './regulations';
import { MastodonAdapter } from './mastodon';
import { StabilityAdapter } from './stability';
import { TwilioAdapter } from './twilio';
import { LangblyAdapter } from './langbly';
import { ApiSportsAdapter } from './apisports';
import { ApiFlashAdapter } from './apiflash';
import { TimeApiAdapter } from './timeapi';
import { GdeltAdapter } from './gdelt';
import { NwsAdapter } from './nws';
import { ExchangeRateAdapter } from './exchangerate';
import { ShortIoAdapter } from './shortio';
import { CalendarificAdapter } from './calendarific';
import { NagerDateAdapter } from './nagerdate';
import { SslCheckerAdapter } from './sslchecker';
import { NhtsaAdapter } from './nhtsa';
import { RestCountriesAdapter } from './restcountries';
import { OpenFoodFactsAdapter } from './openfoodfacts';
import { RandomUserAdapter } from './randomuser';
import { IqairAdapter } from './iqair';
import { FatSecretAdapter } from './fatsecret';
import { HunterAdapter } from './hunter';
import { AutoDevAdapter } from './autodev';
import { GeocodioAdapter } from './geocodio';
import { PodcastIndexAdapter } from './podcastindex';
import { Api2PdfAdapter } from './api2pdf';
import { ConvertApiAdapter } from './convertapi';
import { EuropeanaAdapter } from './europeana';
import { ArticAdapter } from './artic';
import { BlueskyAdapter } from './bluesky';
import { EdgarAdapter } from './edgar';
import { CompaniesHouseAdapter } from './companies-house';
import { GleifAdapter } from './gleif';
import { AssemblyAIAdapter } from './assemblyai';
import { VatcomplyAdapter } from './vatcomply';
import { CloudflareAdapter } from './cloudflare';
import { NameSiloAdapter } from './namesilo';
import { ClinicalTrialsAdapter } from './clinicaltrials';
import { TelegramAdapter } from './telegram';
import { BrowserbaseAdapter } from './browserbase';
import { PexelsAdapter } from './pexels';
import { FirmsAdapter } from './firms';
import { ResendAdapter } from './resend';
import { FedRegisterAdapter } from './fedregister';
import { CourtListenerAdapter } from './courtlistener';
import { FdicAdapter } from './fdic';
import { DiseaseAdapter } from './disease';
import { WhoAdapter } from './who';
import { GdacsAdapter } from './gdacs';
import { RateApiAdapter } from './rateapi';
import { TwitterApiAdapter } from './twitterapi';
import { CurrentsAdapter } from './currents';
import { IbanApiAdapter } from './ibanapi';
import { PubchemAdapter } from './pubchem';
import { OpenChargeMapAdapter } from './openchargemap';
import { IpqsAdapter } from './ipqs';
import { AccountAdapter } from './account';
import { PlatformAdapter } from './platform';
import { RcsbAdapter } from './rcsb';
import { NhtsaSafetyAdapter } from './nhtsa-safety';
import { CactusAdapter } from './cactus';
import { TrackingAdapter } from './17track';
import { MaterialsProjectAdapter } from './materials-project';
import { AuddAdapter } from './audd';
import { ListenNotesAdapter } from './listennotes';
import { ThreatIntelAdapter } from './threatintel';
import { MarketCheckAdapter } from './marketcheck';
import { ZyteAdapter } from './zyte';
import { Judge0Adapter } from './judge0';
import { WeatherApiAdapter } from './weatherapi';
import { ShipEngineAdapter } from './shipengine';
import { PostcodesIoAdapter } from './postcodes-io';
import { DhlAdapter } from './dhl';
import { AdzunaAdapter } from './adzuna';
import { BallDontLieAdapter } from './balldontlie';
import { ZippopotamusAdapter } from './zippopotamus';
import { TheirStackAdapter } from './theirstack';
import { JoobleAdapter } from './jooble';
import { ArbeitnowAdapter } from './arbeitnow';
import { ReedAdapter } from './reed';
import { RemotiveAdapter } from './remotive';
import { CanopyAdapter } from './canopy';
import { SpiderAdapter } from './spider';
import { ImgflipAdapter } from './imgflip';
import { CocktailDbAdapter } from './cocktaildb';
import { GitHubApiAdapter } from './github-api';
import { WikidataAdapter } from './wikidata';
import { DictionaryAdapter } from './dictionary';
import { NoaaAdapter } from './noaa';
import { WhoisJsonAdapter } from './whoisjson';
import { NpmAdapter } from './npm';
import { OsvAdapter } from './osv';
import { CensusAdapter } from './census';
import { UsaSpendingAdapter } from './usaspending';
import { SamAdapter } from './sam';
import { FemaAdapter } from './fema';
import { PypiAdapter } from './pypi';
import { GbifAdapter } from './gbif';
import { CongressAdapter } from './congress';
import { DepsdevAdapter } from './depsdev';
import { EpaAdapter } from './epa';
import { NceiAdapter } from './ncei';
import { ClimateAdapter } from './climate';
import { QuickchartAdapter } from './quickchart';
import { FigiAdapter } from './figi';
import { UsnoAdapter } from './usno';
import { WgerAdapter } from './wger';
import { EmailVerifyAdapter } from './email-verify';
import { SolarAdapter } from './solar';
import { IssAdapter } from './iss';
import { HfAdapter } from './hf';
import { UsgsWaterAdapter } from './usgs-water';
import { WorldBankAdapter } from './worldbank';
import { CdcAdapter } from './cdc';
import { config } from '../config';

/**
 * Adapter registry (§12.43).
 *
 * Maps provider names to adapter instances. Adapters are singletons
 * (stateless, safe to share across requests).
 */

const adapters = new Map<string, BaseAdapter>();

function getOrCreate<T extends BaseAdapter>(key: string, factory: () => T): T {
  let adapter = adapters.get(key);
  if (!adapter) {
    adapter = factory();
    adapters.set(key, adapter);
  }
  return adapter as T;
}

/**
 * Resolve the adapter for a given tool ID.
 * Tool IDs follow the pattern: `{provider}.{action}`.
 * Returns undefined if no adapter is registered for the provider.
 */
export function resolveAdapter(toolId: string): BaseAdapter | undefined {
  const provider = toolId.split('.')[0];

  switch (provider) {
    case 'polymarket':
      return getOrCreate('polymarket', () => new PolymarketAdapter());
    case 'hyperliquid':
      return getOrCreate('hyperliquid', () => new HyperliquidAdapter());
    case 'aster':
      return getOrCreate('asterdex', () => new AsterDexAdapter());
    case 'weather': {
      const key = (config as Record<string, unknown>).PROVIDER_KEY_OPENWEATHER as
        | string
        | undefined;
      if (!key) return undefined;
      return getOrCreate('openweathermap', () => new OpenWeatherMapAdapter(key));
    }
    case 'crypto':
    case 'coingecko': {
      const cgKey = (config as Record<string, unknown>).PROVIDER_KEY_COINGECKO as
        | string
        | undefined;
      if (!cgKey) return undefined;
      return getOrCreate('coingecko', () => new CoinGeckoAdapter(cgKey));
    }
    case 'aviasales': {
      const aviasalesToken = (config as Record<string, unknown>).PROVIDER_KEY_AVIASALES as
        | string
        | undefined;
      if (!aviasalesToken) return undefined;
      return getOrCreate('aviasales', () => new AviasalesAdapter(aviasalesToken));
    }
    case 'sabre': {
      const clientId = (config as Record<string, unknown>).SABRE_CLIENT_ID as string | undefined;
      const clientSecret = (config as Record<string, unknown>).SABRE_CLIENT_SECRET as
        | string
        | undefined;
      if (!clientId || !clientSecret) return undefined;
      return getOrCreate('sabre', () => new SabreAdapter(clientId, clientSecret));
    }
    case 'amadeus': {
      const apiKey = (config as Record<string, unknown>).AMADEUS_API_KEY as string | undefined;
      const apiSecret = (config as Record<string, unknown>).AMADEUS_API_SECRET as
        | string
        | undefined;
      if (!apiKey || !apiSecret) return undefined;
      return getOrCreate('amadeus', () => new AmadeusAdapter(apiKey, apiSecret));
    }
    case 'foursquare': {
      const key = (config as Record<string, unknown>).PROVIDER_KEY_FOURSQUARE as string | undefined;
      if (!key) return undefined;
      return getOrCreate('foursquare', () => new FoursquareAdapter(key));
    }
    case 'ticketmaster': {
      const key = (config as Record<string, unknown>).PROVIDER_KEY_TICKETMASTER as
        | string
        | undefined;
      if (!key) return undefined;
      return getOrCreate('ticketmaster', () => new TicketmasterAdapter(key));
    }
    case 'tmdb': {
      const token = (config as Record<string, unknown>).TMDB_ACCESS_TOKEN as string | undefined;
      if (!token) return undefined;
      return getOrCreate('tmdb', () => new TmdbAdapter(token));
    }
    case 'health': {
      const usdaKey = (config as Record<string, unknown>).PROVIDER_KEY_USDA as string | undefined;
      if (!usdaKey) return undefined;
      const openFdaKey = (config as Record<string, unknown>).PROVIDER_KEY_OPENFDA as
        | string
        | undefined;
      return getOrCreate('health', () => new HealthAdapter(usdaKey, openFdaKey || undefined));
    }
    case 'finance': {
      // 5/6 tools need no key; only FRED requires PROVIDER_KEY_FRED (optional)
      const fredKey = (config as Record<string, unknown>).PROVIDER_KEY_FRED as string | undefined;
      return getOrCreate('finance', () => new FinanceAdapter(fredKey || undefined));
    }
    case 'music':
      // All 3 providers (MusicBrainz, ListenBrainz, RadioBrowser) are free, no API keys needed
      return getOrCreate('music', () => new MusicAdapter());
    case 'jobs': {
      const onetKey = (config as Record<string, unknown>).PROVIDER_KEY_ONET as string | undefined;
      if (!onetKey || onetKey === 'MANUAL_REQUIRED') return undefined;
      const blsKey = (config as Record<string, unknown>).PROVIDER_KEY_BLS as string | undefined;
      const cjKey = (config as Record<string, unknown>).PROVIDER_KEY_CAREERJET as
        | string
        | undefined;
      return getOrCreate(
        'jobs',
        () => new JobsAdapter(onetKey, blsKey || undefined, cjKey || undefined),
      );
    }
    case 'education': {
      // All 5 providers are free; Scorecard uses DEMO_KEY by default, PubMed key is optional
      const scorecardKey = (config as Record<string, unknown>).PROVIDER_KEY_SCORECARD as
        | string
        | undefined;
      const pubmedKey = (config as Record<string, unknown>).PROVIDER_KEY_PUBMED as
        | string
        | undefined;
      return getOrCreate(
        'education',
        () => new EducationAdapter(scorecardKey || undefined, pubmedKey || undefined),
      );
    }
    case 'geo': {
      const geoKey = (config as Record<string, unknown>).PROVIDER_KEY_GEOAPIFY as
        | string
        | undefined;
      if (!geoKey) return undefined;
      return getOrCreate('geo', () => new GeoAdapter(geoKey));
    }
    case 'aipush': {
      const aipushSecret = (config as Record<string, unknown>).AIPUSH_INTERNAL_SECRET as
        | string
        | undefined;
      if (!aipushSecret) return undefined;
      const aipushUrl = (config as Record<string, unknown>).AIPUSH_INTERNAL_URL as
        | string
        | undefined;
      return getOrCreate('aipush', () => new AIPushAdapter(aipushSecret, aipushUrl || undefined));
    }
    case 'diffbot': {
      const diffbotKey = (config as Record<string, unknown>).PROVIDER_KEY_DIFFBOT as
        | string
        | undefined;
      if (!diffbotKey) return undefined;
      return getOrCreate('diffbot', () => new DiffbotAdapter(diffbotKey));
    }
    case 'whois': {
      const whoisKey = (config as Record<string, unknown>).PROVIDER_KEY_WHOISXML as
        | string
        | undefined;
      if (!whoisKey) return undefined;
      return getOrCreate('whoisxml', () => new WhoisXmlAdapter(whoisKey));
    }
    case 'spoonacular': {
      const spoonKey = (config as Record<string, unknown>).PROVIDER_KEY_SPOONACULAR as
        | string
        | undefined;
      if (!spoonKey) return undefined;
      return getOrCreate('spoonacular', () => new SpoonacularAdapter(spoonKey));
    }
    case 'nasa': {
      const nasaKey = (config as Record<string, unknown>).PROVIDER_KEY_NASA as string | undefined;
      if (!nasaKey) return undefined;
      return getOrCreate('nasa', () => new NasaAdapter(nasaKey));
    }
    case 'jpl':
      // JPL SSD APIs are open access — no API key needed
      return getOrCreate('jpl', () => new JplAdapter());
    case 'rawg': {
      const rawgKey = (config as Record<string, unknown>).PROVIDER_KEY_RAWG as string | undefined;
      if (!rawgKey) return undefined;
      return getOrCreate('rawg', () => new RawgAdapter(rawgKey));
    }
    case 'igdb': {
      const igdbClientId = (config as Record<string, unknown>).IGDB_CLIENT_ID as string | undefined;
      const igdbClientSecret = (config as Record<string, unknown>).IGDB_CLIENT_SECRET as
        | string
        | undefined;
      if (!igdbClientId || !igdbClientSecret) return undefined;
      return getOrCreate('igdb', () => new IgdbAdapter(igdbClientId, igdbClientSecret));
    }
    case 'qrserver':
      // QRServer APIs are open access — no API key needed
      return getOrCreate('qrserver', () => new QrServerAdapter());
    case 'upc':
      // UPCitemdb free trial tier — no API key needed
      return getOrCreate('upcitemdb', () => new UpcItemDbAdapter());
    case 'ip':
      // ipapi.is free tier — no API key needed (1K/day)
      return getOrCreate('ipapi', () => new IpApiAdapter());
    case 'earthquake':
      // USGS Earthquake — open access, no API key needed
      return getOrCreate('usgs-earthquake', () => new UsgsEarthquakeAdapter());
    case 'anime':
    case 'manga':
      // Jikan (MyAnimeList) — open access, no API key, MIT licensed
      return getOrCreate('jikan', () => new JikanAdapter());
    case 'books':
      // Open Library — open access, no API key, CC0
      return getOrCreate('openlibrary', () => new OpenLibraryAdapter());
    case 'email': {
      const zbKey = (config as Record<string, unknown>).PROVIDER_KEY_ZEROBOUNCE as
        | string
        | undefined;
      if (!zbKey) return undefined;
      return getOrCreate('zerobounce', () => new ZeroBounceAdapter(zbKey));
    }
    case 'shorturl': {
      const sioKey = (config as Record<string, unknown>).PROVIDER_KEY_SHORTIO as string | undefined;
      if (!sioKey) return undefined;
      return getOrCreate('shortio', () => new ShortIoAdapter(sioKey));
    }
    case 'exchangerate': {
      const erKey = (config as Record<string, unknown>).PROVIDER_KEY_EXCHANGERATE as
        | string
        | undefined;
      if (!erKey) return undefined;
      return getOrCreate('exchangerate', () => new ExchangeRateAdapter(erKey));
    }
    case 'calendarific': {
      const calKey = (config as Record<string, unknown>).PROVIDER_KEY_CALENDARIFIC as
        | string
        | undefined;
      if (!calKey) return undefined;
      return getOrCreate('calendarific', () => new CalendarificAdapter(calKey));
    }
    case 'weather_alerts':
      return getOrCreate('nws', () => new NwsAdapter());
    case 'holidays':
      return getOrCreate('nagerdate', () => new NagerDateAdapter());
    case 'vin':
      return getOrCreate('nhtsa', () => new NhtsaAdapter());
    case 'country':
      return getOrCreate('restcountries', () => new RestCountriesAdapter());
    case 'food':
      return getOrCreate('openfoodfacts', () => new OpenFoodFactsAdapter());
    case 'random':
      return getOrCreate('randomuser', () => new RandomUserAdapter());
    case 'ssl':
      return getOrCreate('sslchecker', () => new SslCheckerAdapter());
    case 'gdelt':
      return getOrCreate('gdelt', () => new GdeltAdapter());
    case 'firms': {
      const firmsKey = (config as Record<string, unknown>).PROVIDER_KEY_FIRMS as string | undefined;
      if (!firmsKey) return undefined;
      return getOrCreate('firms', () => new FirmsAdapter(firmsKey));
    }
    case 'worldclock':
      return getOrCreate('timeapi', () => new TimeApiAdapter());
    case 'screenshot': {
      const flashKey = (config as Record<string, unknown>).PROVIDER_KEY_APIFLASH as
        | string
        | undefined;
      if (!flashKey) return undefined;
      return getOrCreate('apiflash', () => new ApiFlashAdapter(flashKey));
    }
    case 'sports': {
      const sportsKey = (config as Record<string, unknown>).PROVIDER_KEY_APISPORTS as
        | string
        | undefined;
      if (!sportsKey) return undefined;
      return getOrCreate('apisports', () => new ApiSportsAdapter(sportsKey));
    }
    case 'langbly': {
      const lbKey = (config as Record<string, unknown>).PROVIDER_KEY_LANGBLY as string | undefined;
      if (!lbKey) return undefined;
      return getOrCreate('langbly', () => new LangblyAdapter(lbKey));
    }
    case 'twilio': {
      const twilioSid = (config as Record<string, unknown>).TWILIO_ACCOUNT_SID as
        | string
        | undefined;
      const twilioToken = (config as Record<string, unknown>).TWILIO_AUTH_TOKEN as
        | string
        | undefined;
      if (!twilioSid || !twilioToken) return undefined;
      return getOrCreate('twilio', () => new TwilioAdapter(twilioSid, twilioToken));
    }
    case 'stability': {
      const stabKey = (config as Record<string, unknown>).PROVIDER_KEY_STABILITY as
        | string
        | undefined;
      if (!stabKey) return undefined;
      return getOrCreate('stability', () => new StabilityAdapter(stabKey));
    }
    case 'resend': {
      const resendKey = (config as Record<string, unknown>).PROVIDER_KEY_RESEND as
        | string
        | undefined;
      if (!resendKey) return undefined;
      return getOrCreate('resend', () => new ResendAdapter(resendKey));
    }
    case 'mastodon':
      return getOrCreate('mastodon', () => new MastodonAdapter());
    case 'regulations':
      return getOrCreate('regulations', () => new RegulationsAdapter());
    case 'fedregister':
      return getOrCreate('fedregister', () => new FedRegisterAdapter());
    case 'courtlistener':
      return getOrCreate('courtlistener', () => new CourtListenerAdapter());
    case 'ocr': {
      const ocrKey = (config as Record<string, unknown>).PROVIDER_KEY_OCRSPACE as
        | string
        | undefined;
      if (!ocrKey) return undefined;
      return getOrCreate('ocrspace', () => new OcrSpaceAdapter(ocrKey));
    }
    case 'finnhub': {
      const fhKey = (config as Record<string, unknown>).PROVIDER_KEY_FINNHUB as string | undefined;
      if (!fhKey) return undefined;
      return getOrCreate('finnhub', () => new FinnhubAdapter(fhKey));
    }
    case 'news': {
      const newsKey = (config as Record<string, unknown>).PROVIDER_KEY_NEWSDATA as
        | string
        | undefined;
      if (!newsKey) return undefined;
      return getOrCreate('newsdata', () => new NewsDataAdapter(newsKey));
    }
    case 'exa': {
      const exaKey = (config as Record<string, unknown>).PROVIDER_KEY_EXA as string | undefined;
      if (!exaKey) return undefined;
      return getOrCreate('exa', () => new ExaAdapter(exaKey));
    }
    case 'tavily': {
      const tavilyKey = (config as Record<string, unknown>).PROVIDER_KEY_TAVILY as
        | string
        | undefined;
      if (!tavilyKey) return undefined;
      return getOrCreate('tavily', () => new TavilyAdapter(tavilyKey));
    }
    case 'serper': {
      const serperKey = (config as Record<string, unknown>).PROVIDER_KEY_SERPER as
        | string
        | undefined;
      if (!serperKey) return undefined;
      return getOrCreate('serper', () => new SerperAdapter(serperKey));
    }
    case 'usrealestate': {
      const rapidKey = (config as Record<string, unknown>).PROVIDER_KEY_RAPIDAPI as
        | string
        | undefined;
      if (!rapidKey) return undefined;
      return getOrCreate('usrealestate', () => new UsRealEstateAdapter(rapidKey));
    }
    case 'walkscore': {
      const wsKey = (config as Record<string, unknown>).PROVIDER_KEY_WALKSCORE as
        | string
        | undefined;
      if (!wsKey) return undefined;
      return getOrCreate('walkscore', () => new WalkScoreAdapter(wsKey));
    }
    case 'airquality': {
      const iqairKey = (config as Record<string, unknown>).PROVIDER_KEY_IQAIR as string | undefined;
      if (!iqairKey) return undefined;
      return getOrCreate('iqair', () => new IqairAdapter(iqairKey));
    }
    case 'pexels': {
      const pxKey = (config as Record<string, unknown>).PROVIDER_KEY_PEXELS as string | undefined;
      if (!pxKey) return undefined;
      return getOrCreate('pexels', () => new PexelsAdapter(pxKey));
    }
    case 'browser': {
      const bbKey = (config as Record<string, unknown>).BROWSERBASE_API_KEY as string | undefined;
      const bbProject = (config as Record<string, unknown>).BROWSERBASE_PROJECT_ID as
        | string
        | undefined;
      if (!bbKey || !bbProject) return undefined;
      return getOrCreate('browserbase', () => new BrowserbaseAdapter(bbKey, bbProject));
    }
    case 'telegram': {
      const tgToken = (config as Record<string, unknown>).TELEGRAM_BOT_TOKEN as string | undefined;
      if (!tgToken) return undefined;
      return getOrCreate('telegram', () => new TelegramAdapter(tgToken));
    }
    case 'clinical':
      return getOrCreate('clinicaltrials', () => new ClinicalTrialsAdapter());
    case 'namesilo': {
      const nsKey = (config as Record<string, unknown>).PROVIDER_KEY_NAMESILO as string | undefined;
      if (!nsKey) return undefined;
      return getOrCreate('namesilo', () => new NameSiloAdapter(nsKey));
    }
    case 'cloudflare': {
      const cfKey = (config as Record<string, unknown>).CLOUDFLARE_API_KEY as string | undefined;
      const cfEmail = (config as Record<string, unknown>).CLOUDFLARE_EMAIL as string | undefined;
      if (!cfKey || !cfEmail) return undefined;
      return getOrCreate('cloudflare', () => new CloudflareAdapter(cfKey, cfEmail));
    }
    case 'vatcomply':
      return getOrCreate('vatcomply', () => new VatcomplyAdapter());
    case 'transcribe': {
      const aaiKey = (config as Record<string, unknown>).PROVIDER_KEY_ASSEMBLYAI as
        | string
        | undefined;
      if (!aaiKey) return undefined;
      return getOrCreate('assemblyai', () => new AssemblyAIAdapter(aaiKey));
    }
    case 'lei':
      return getOrCreate('gleif', () => new GleifAdapter());
    case 'ukcompany': {
      const chKey = (config as Record<string, unknown>).PROVIDER_KEY_COMPANIES_HOUSE as
        | string
        | undefined;
      if (!chKey) return undefined;
      return getOrCreate('companies-house', () => new CompaniesHouseAdapter(chKey));
    }
    case 'edgar':
      return getOrCreate('edgar', () => new EdgarAdapter());
    case 'bluesky': {
      const bsHandle = (config as Record<string, unknown>).BLUESKY_HANDLE as string | undefined;
      const bsPassword = (config as Record<string, unknown>).BLUESKY_APP_PASSWORD as
        | string
        | undefined;
      if (!bsHandle || !bsPassword) return undefined;
      return getOrCreate('bluesky', () => new BlueskyAdapter(bsHandle, bsPassword));
    }
    case 'artic':
      return getOrCreate('artic', () => new ArticAdapter());
    case 'europeana': {
      const euKey = (config as Record<string, unknown>).PROVIDER_KEY_EUROPEANA as
        | string
        | undefined;
      if (!euKey) return undefined;
      return getOrCreate('europeana', () => new EuropeanaAdapter(euKey));
    }
    case 'convert': {
      const convertKey = (config as Record<string, unknown>).PROVIDER_KEY_CONVERTAPI as
        | string
        | undefined;
      if (!convertKey) return undefined;
      return getOrCreate('convertapi', () => new ConvertApiAdapter(convertKey));
    }
    case 'pdf': {
      const pdfKey = (config as Record<string, unknown>).PROVIDER_KEY_API2PDF as string | undefined;
      if (!pdfKey) return undefined;
      return getOrCreate('api2pdf', () => new Api2PdfAdapter(pdfKey));
    }
    case 'podcast': {
      const piKey = (config as Record<string, unknown>).PROVIDER_KEY_PODCASTINDEX as
        | string
        | undefined;
      const piSecret = (config as Record<string, unknown>).PROVIDER_SECRET_PODCASTINDEX as
        | string
        | undefined;
      if (!piKey || !piSecret) return undefined;
      return getOrCreate('podcastindex', () => new PodcastIndexAdapter(piKey, piSecret));
    }
    case 'geocodio': {
      const geocodioKey = (config as Record<string, unknown>).PROVIDER_KEY_GEOCODIO as
        | string
        | undefined;
      if (!geocodioKey) return undefined;
      return getOrCreate('geocodio', () => new GeocodioAdapter(geocodioKey));
    }
    case 'autodev': {
      const autodevKey = (config as Record<string, unknown>).PROVIDER_KEY_AUTODEV as
        | string
        | undefined;
      if (!autodevKey) return undefined;
      return getOrCreate('autodev', () => new AutoDevAdapter(autodevKey));
    }
    case 'hunter': {
      const hunterKey = (config as Record<string, unknown>).PROVIDER_KEY_HUNTER as
        | string
        | undefined;
      if (!hunterKey) return undefined;
      return getOrCreate('hunter', () => new HunterAdapter(hunterKey));
    }
    case 'fatsecret': {
      const fsId = (config as Record<string, unknown>).FATSECRET_CLIENT_ID as string | undefined;
      const fsSecret = (config as Record<string, unknown>).FATSECRET_CLIENT_SECRET as
        | string
        | undefined;
      if (!fsId || !fsSecret) return undefined;
      return getOrCreate('fatsecret', () => new FatSecretAdapter(fsId, fsSecret));
    }
    case 'fdic':
      return getOrCreate('fdic', () => new FdicAdapter());
    case 'disease':
      return getOrCreate('disease', () => new DiseaseAdapter());
    case 'who':
      return getOrCreate('who', () => new WhoAdapter());
    case 'gdacs':
      return getOrCreate('gdacs', () => new GdacsAdapter());
    case 'rateapi': {
      const rateKey = (config as Record<string, unknown>).PROVIDER_KEY_RATEAPI as
        | string
        | undefined;
      if (!rateKey) return undefined;
      return getOrCreate('rateapi', () => new RateApiAdapter(rateKey));
    }
    case 'iban':
    case 'ibanapi': {
      const ibanKey = (config as Record<string, unknown>).PROVIDER_KEY_IBANAPI as
        | string
        | undefined;
      if (!ibanKey) return undefined;
      return getOrCreate('ibanapi', () => new IbanApiAdapter(ibanKey));
    }
    case 'currents': {
      const currKey = (config as Record<string, unknown>).PROVIDER_KEY_CURRENTS as
        | string
        | undefined;
      if (!currKey) return undefined;
      return getOrCreate('currents', () => new CurrentsAdapter(currKey));
    }
    case 'twitter':
    case 'twitterapi': {
      const twKey = (config as Record<string, unknown>).PROVIDER_KEY_TWITTERAPI as
        | string
        | undefined;
      if (!twKey) return undefined;
      return getOrCreate('twitterapi', () => new TwitterApiAdapter(twKey));
    }
    case 'pubchem': {
      const ncbiKey = ((config as Record<string, unknown>).PROVIDER_KEY_NCBI as string) || '';
      return getOrCreate('pubchem', () => new PubchemAdapter(ncbiKey));
    }
    case 'evcharge':
    case 'openchargemap': {
      const ocmKey = (config as Record<string, unknown>).PROVIDER_KEY_OPENCHARGEMAP as
        | string
        | undefined;
      if (!ocmKey) return undefined;
      return getOrCreate('openchargemap', () => new OpenChargeMapAdapter(ocmKey));
    }
    case 'ipqs': {
      const ipqsKey = (config as Record<string, unknown>).PROVIDER_KEY_IPQS as string | undefined;
      if (!ipqsKey) return undefined;
      return getOrCreate('ipqs', () => new IpqsAdapter(ipqsKey));
    }
    case 'account':
      // Internal adapter — queries execution_ledger for agent analytics (F4)
      return getOrCreate('account', () => new AccountAdapter());
    case 'platform':
      // Internal adapter — tool quality index + batch API (F1, F5)
      return getOrCreate('platform', () => new PlatformAdapter());
    case 'pdb':
      // RCSB Protein Data Bank — open access, no API key (UC-218)
      return getOrCreate('rcsb', () => new RcsbAdapter());
    case 'safety':
      // NHTSA Safety — recalls, complaints, ratings, investigations (UC-219)
      return getOrCreate('nhtsa-safety', () => new NhtsaSafetyAdapter());
    case 'chem':
      // NCI CACTUS — chemical identifier resolution (UC-220)
      return getOrCreate('cactus', () => new CactusAdapter());
    case 'bdl': {
      // BallDontLie — sports data (UC-251)
      const bdlKey = (config as Record<string, unknown>).PROVIDER_KEY_BDL as string | undefined;
      if (!bdlKey) return undefined;
      return getOrCreate('balldontlie', () => new BallDontLieAdapter(bdlKey));
    }
    case 'postal':
      // Zippopotam.us — global postal codes (UC-250)
      return getOrCreate('zippopotamus', () => new ZippopotamusAdapter());
    case 'adzuna': {
      const adzId = (config as Record<string, unknown>).ADZUNA_APP_ID as string | undefined;
      const adzKey = (config as Record<string, unknown>).ADZUNA_APP_KEY as string | undefined;
      if (!adzId || !adzKey) return undefined;
      return getOrCreate('adzuna', () => new AdzunaAdapter(adzId, adzKey));
    }
    case 'dhl': {
      // DHL — shipment tracking (UC-228)
      const dhlKey = (config as Record<string, unknown>).PROVIDER_KEY_DHL as string | undefined;
      if (!dhlKey) return undefined;
      return getOrCreate('dhl', () => new DhlAdapter(dhlKey));
    }
    case 'ukpost':
      // Postcodes.io — UK postal lookup (UC-249)
      return getOrCreate('postcodes-io', () => new PostcodesIoAdapter());
    case 'shipengine': {
      // ShipEngine — shipping rates + address validation (UC-246)
      const seKey = (config as Record<string, unknown>).PROVIDER_KEY_SHIPENGINE as
        | string
        | undefined;
      if (!seKey) return undefined;
      return getOrCreate('shipengine', () => new ShipEngineAdapter(seKey));
    }
    case 'weatherapi': {
      // WeatherAPI.com — global weather (UC-243)
      const waKey = (config as Record<string, unknown>).PROVIDER_KEY_WEATHERAPI as
        | string
        | undefined;
      if (!waKey) return undefined;
      return getOrCreate('weatherapi', () => new WeatherApiAdapter(waKey));
    }
    case 'code':
      // Judge0 CE — code execution sandbox (UC-238)
      return getOrCreate('judge0', () => new Judge0Adapter());
    case 'scrape': {
      // Zyte — web scraping (UC-233)
      const zyteKey = (config as Record<string, unknown>).PROVIDER_KEY_ZYTE as string | undefined;
      if (!zyteKey) return undefined;
      return getOrCreate('zyte', () => new ZyteAdapter(zyteKey));
    }
    case 'carmarket': {
      // MarketCheck — car listings (UC-231)
      const mcKey = (config as Record<string, unknown>).PROVIDER_KEY_MARKETCHECK as
        | string
        | undefined;
      if (!mcKey) return undefined;
      return getOrCreate('marketcheck', () => new MarketCheckAdapter(mcKey));
    }
    case 'threatintel': {
      // Threat Intelligence Platform — domain reputation (UC-227)
      const tiKey = (config as Record<string, unknown>).PROVIDER_KEY_THREATINTEL as
        | string
        | undefined;
      if (!tiKey) return undefined;
      return getOrCreate('threatintel', () => new ThreatIntelAdapter(tiKey));
    }
    case 'listennotes': {
      // Listen Notes — podcast search (UC-225)
      const lnKey = (config as Record<string, unknown>).PROVIDER_KEY_LISTENNOTES as
        | string
        | undefined;
      if (!lnKey) return undefined;
      return getOrCreate('listennotes', () => new ListenNotesAdapter(lnKey));
    }
    case 'audd': {
      // AudD — music recognition / audio fingerprinting (UC-226)
      const auddKey = (config as Record<string, unknown>).PROVIDER_KEY_AUDD as string | undefined;
      if (!auddKey) return undefined;
      return getOrCreate('audd', () => new AuddAdapter(auddKey));
    }
    case 'materials': {
      // Materials Project — materials science properties (UC-222)
      const mpKey = (config as Record<string, unknown>).PROVIDER_KEY_MATERIALS_PROJECT as
        | string
        | undefined;
      if (!mpKey) return undefined;
      return getOrCreate('materials-project', () => new MaterialsProjectAdapter(mpKey));
    }
    case 'tracking': {
      // 17TRACK — package tracking (UC-221)
      const track17Key = (config as Record<string, unknown>).PROVIDER_KEY_17TRACK as
        | string
        | undefined;
      if (!track17Key) return undefined;
      return getOrCreate('17track', () => new TrackingAdapter(track17Key));
    }
    case 'theirstack': {
      const tsKey = (config as Record<string, unknown>).PROVIDER_KEY_THEIRSTACK as
        | string
        | undefined;
      if (!tsKey) return undefined;
      return getOrCreate('theirstack', () => new TheirStackAdapter(tsKey));
    }
    case 'jooble': {
      const joobleKey = (config as Record<string, unknown>).PROVIDER_KEY_JOOBLE as
        | string
        | undefined;
      if (!joobleKey) return undefined;
      return getOrCreate('jooble', () => new JoobleAdapter(joobleKey));
    }
    case 'arbeitnow':
      // Arbeitnow — open public API, no auth needed (UC-256)
      return getOrCreate('arbeitnow', () => new ArbeitnowAdapter());
    case 'reed': {
      const reedKey = (config as Record<string, unknown>).PROVIDER_KEY_REED as string | undefined;
      if (!reedKey) return undefined;
      return getOrCreate('reed', () => new ReedAdapter(reedKey));
    }
    case 'remotive':
      // Remotive — open public API, no auth needed (UC-258)
      return getOrCreate('remotive', () => new RemotiveAdapter());
    case 'canopy': {
      const canopyKey = (config as Record<string, unknown>).PROVIDER_KEY_CANOPY as
        | string
        | undefined;
      if (!canopyKey) return undefined;
      return getOrCreate('canopy', () => new CanopyAdapter(canopyKey));
    }
    case 'spider': {
      const spiderKey = (config as Record<string, unknown>).PROVIDER_KEY_SPIDER as
        | string
        | undefined;
      if (!spiderKey) return undefined;
      return getOrCreate('spider', () => new SpiderAdapter(spiderKey));
    }
    case 'imgflip': {
      const imgUser = (config as Record<string, unknown>).IMGFLIP_USERNAME as string | undefined;
      const imgPass = (config as Record<string, unknown>).IMGFLIP_PASSWORD as string | undefined;
      if (!imgUser || !imgPass) return undefined;
      return getOrCreate('imgflip', () => new ImgflipAdapter(imgUser, imgPass));
    }
    case 'cocktail':
      // TheCocktailDB — free, no auth, test key "1" (UC-304)
      return getOrCreate('cocktaildb', () => new CocktailDbAdapter());
    case 'github': {
      const ghToken = (config as Record<string, unknown>).PROVIDER_KEY_GITHUB as string | undefined;
      if (!ghToken) return undefined;
      return getOrCreate('github-api', () => new GitHubApiAdapter(ghToken));
    }
    case 'wikidata':
      // Wikidata — CC-0 open data, no auth (UC-323)
      return getOrCreate('wikidata', () => new WikidataAdapter());
    case 'dictionary':
      // Free Dictionary + Datamuse — no auth (UC-313, UC-314)
      return getOrCreate('dictionary', () => new DictionaryAdapter());
    case 'noaa':
      // NOAA NWS Weather — US forecasts + observations, no auth (UC-324)
      return getOrCreate('noaa', () => new NoaaAdapter());
    case 'whoisjson': {
      const wjKey = (config as Record<string, unknown>).PROVIDER_KEY_WHOISJSON as
        | string
        | undefined;
      if (!wjKey) return undefined;
      return getOrCreate('whoisjson', () => new WhoisJsonAdapter(wjKey));
    }
    case 'npm':
      // npm Registry — no auth, public API (UC-344)
      return getOrCreate('npm', () => new NpmAdapter());
    case 'osv':
      // OSV.dev — vulnerability database, no auth, Apache 2.0 (UC-345)
      return getOrCreate('osv', () => new OsvAdapter());
    case 'census': {
      const censusKey = (config as Record<string, unknown>).PROVIDER_KEY_CENSUS as
        | string
        | undefined;
      if (!censusKey) return undefined;
      return getOrCreate('census', () => new CensusAdapter(censusKey));
    }
    case 'spending':
      // USAspending — federal contracts/grants, no auth (UC-335)
      return getOrCreate('spending', () => new UsaSpendingAdapter());
    case 'sam': {
      const samKey = (config as Record<string, unknown>).PROVIDER_KEY_SAM as string | undefined;
      if (!samKey) return undefined;
      return getOrCreate('sam', () => new SamAdapter(samKey));
    }
    case 'fema':
      // OpenFEMA — disaster data, no auth (UC-334)
      return getOrCreate('fema', () => new FemaAdapter());
    case 'pypi':
      // PyPI — Python Package Index, no auth (UC-346)
      return getOrCreate('pypi', () => new PypiAdapter());
    case 'gbif':
      // GBIF — Global Biodiversity, no auth, CC0 (UC-341)
      return getOrCreate('gbif', () => new GbifAdapter());
    case 'congress': {
      const congressKey = (config as Record<string, unknown>).PROVIDER_KEY_CONGRESS as
        | string
        | undefined;
      if (!congressKey) return undefined;
      return getOrCreate('congress', () => new CongressAdapter(congressKey));
    }
    case 'depsdev':
      // deps.dev — Google Open Source Insights, no auth, Apache 2.0 (UC-347)
      return getOrCreate('depsdev', () => new DepsdevAdapter());
    case 'epa':
      // EPA Envirofacts — environmental data, no auth (UC-337)
      return getOrCreate('epa', () => new EpaAdapter());
    case 'ncei': {
      const nceiToken = (config as Record<string, unknown>).PROVIDER_KEY_NOAA_NCEI as
        | string
        | undefined;
      if (!nceiToken) return undefined;
      return getOrCreate('ncei', () => new NceiAdapter(nceiToken));
    }
    case 'climate':
      // Global Warming API — climate indicators, no auth, MIT (UC-342)
      return getOrCreate('climate', () => new ClimateAdapter());
    case 'chart':
      // QuickChart — chart image generation, no auth, MIT
      return getOrCreate('chart', () => new QuickchartAdapter());
    case 'figi': {
      const figiKey = (config as Record<string, unknown>).PROVIDER_KEY_OPENFIGI as
        | string
        | undefined;
      return getOrCreate('figi', () => new FigiAdapter(figiKey ?? ''));
    }
    case 'usno':
      // USNO Astronomical — moon phases, sun/moon, seasons, no auth (UC-353)
      return getOrCreate('usno', () => new UsnoAdapter());
    case 'wger':
      // Wger — exercise + nutrition database, no auth, CC-BY-SA (UC-360)
      return getOrCreate('wger', () => new WgerAdapter());
    case 'email_verify': {
      // WhoisXML Email Verification — reuses PROVIDER_KEY_WHOISXML (UC-363)
      const evKey = (config as Record<string, unknown>).PROVIDER_KEY_WHOISXML as string | undefined;
      if (!evKey) return undefined;
      return getOrCreate('email_verify', () => new EmailVerifyAdapter(evKey));
    }
    case 'solar': {
      const solarKey = (config as Record<string, unknown>).PROVIDER_KEY_SOLARSYSTEM as
        | string
        | undefined;
      if (!solarKey) return undefined;
      return getOrCreate('solar', () => new SolarAdapter(solarKey));
    }
    case 'iss':
      // ISS Tracker — real-time position, no auth (UC-355)
      return getOrCreate('iss', () => new IssAdapter());
    case 'hf':
      // HuggingFace Hub — ML model + dataset registry, no auth (UC-367)
      return getOrCreate('hf', () => new HfAdapter());
    case 'water':
      // USGS Water Services — real-time streamflow + water levels, no auth (UC-369)
      return getOrCreate('usgs-water', () => new UsgsWaterAdapter());
    case 'worldbank':
      // World Bank Indicators — 16K+ global development indicators, no auth (UC-372)
      return getOrCreate('worldbank', () => new WorldBankAdapter());
    case 'cdc':
      // CDC Open Data — US public health datasets via Socrata SODA, no auth (UC-371)
      return getOrCreate('cdc', () => new CdcAdapter());
    default:
      return undefined;
  }
}
