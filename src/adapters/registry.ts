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
import { SmithsonianAdapter } from './smithsonian';
import { JplAdapter } from './jpl';
import { SoilAdapter } from './soil';
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
import { IrctcAdapter } from './irctc';
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
import { TelnyxAdapter } from './telnyx';
import { SwpcAdapter } from './swpc';
import { BibleAdapter } from './bible';
import { GutendexAdapter } from './gutendex';
import { LibriVoxAdapter } from './librivox';
import { TatoebaAdapter } from './tatoeba';
import { LocAdapter } from './loc';
import { UkPoliceAdapter } from './ukpolice';
import { BrasilApiAdapter } from './brasilapi';
import { IbgeAdapter } from './ibge';
import { BcbAdapter } from './bcb';
import { EurostatAdapter } from './eurostat';
import { DataGovSgAdapter } from './datagovsg';
import { AirNowAdapter } from './airnow';
import { NpsAdapter } from './nps';
import { EiaAdapter } from './eia';
import { FecAdapter } from './fec';
import { FccAdapter } from './fcc';
import { NasaExoplanetAdapter } from './nasaexoplanet';
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
import { DblpAdapter } from './dblp';
import { NoaaTidesAdapter } from './noaa-tides';
import { MetMuseumAdapter } from './met-museum';
import { RijksmuseumAdapter } from './rijksmuseum';
import { CmaAdapter } from './cma';
import { RazorpayIfscAdapter } from './razorpayifsc';
import { LichessAdapter } from './lichess';
import { ChesscomAdapter } from './chesscom';
import { AwcAdapter } from './awc';
import { UkfsaAdapter } from './ukfsa';
import { GovukAdapter } from './govuk';
import { ScbAdapter } from './scb';
import { NvdAdapter } from './nvd';
import { UsajobsAdapter } from './usajobs';
import { NrelAdapter } from './nrel';
import { OpenDotaAdapter } from './opendota';
import { CheckWxAdapter } from './checkwx';
import { AvwxAdapter } from './avwx';
import { NihReporterAdapter } from './nihreporter';
import { UnsdgAdapter } from './unsdg';
import { DataCiteAdapter } from './datacite';
import { SsbNorwayAdapter } from './ssbnorway';
import { OverpassAdapter } from './overpass';
import { ZenodoAdapter } from './zenodo';
import { NasaNtrsAdapter } from './nasantrs';
import { CernOpenDataAdapter } from './cernopendata';
import { CelesTrakAdapter } from './celestrak';
import { EonetAdapter } from './eonet';
import { RxNormAdapter } from './rxnorm';
import { MyGeneAdapter } from './mygene';
import { MyVariantAdapter } from './myvariant';
import { MyChemAdapter } from './mychem';
import { DroughtMonitorAdapter } from './drought-monitor';
import { EuropepmcAdapter } from './europepmc';
import { RorAdapter } from './ror';
import { CatalogueOfLifeAdapter } from './catalogue-of-life';
import { OpenContextAdapter } from './opencontext';
import { WtoAdapter } from './wto';
import { InseeAdapter } from './insee';
import { BhlAdapter } from './bhl';
import { GfwAdapter } from './gfw';
import { OpenstatesAdapter } from './openstates';
import { VamAdapter } from './vam';
import { PharmGkbAdapter } from './pharmgkb';
import { BrregAdapter } from './brreg';
import { WormsAdapter } from './worms';
import { BankOfCanadaAdapter } from './bankofcanada';
import { OpenSenseMapAdapter } from './opensensemap';
import { OpenFdaDevicesAdapter } from './openfda-devices';
import { MarineAdapter } from './marine';
import { MfapiAdapter } from './mfapi';
import { SdwisAdapter } from './sdwis';
import { BlsMacroAdapter } from './bls-macro';
import { MbtaTransitAdapter } from './mbta-transit';
import { UnhcrAdapter } from './unhcr';
import { GeoNamesAdapter } from './geonames';
import { CarbonIntensityUkAdapter } from './carbon-intensity-uk';
import { OpenTopoDataAdapter } from './opentopodata';
import { MetNorwayAdapter } from './met-norway';
import { FrankfurterAdapter } from './frankfurter';
import { SunriseSunsetAdapter } from './sunrisesunset';
import { PokeApiAdapter } from './pokeapi';
import { SaMuniAdapter } from './samuni';
import { TvMazeAdapter } from './tvmaze';
import { HackernewsAdapter } from './hackernews';
import { HnAlgoliaAdapter } from './hnalgolia';
import { WikipediaAdapter } from './wikipedia';
import { IrailAdapter } from './irail';
import { NorgesBankAdapter } from './norgesbank';
import { SwissFsoAdapter } from './swissfso';
import { TreasuryFiscalAdapter } from './treasuryfiscal';
import { UsdaMarsAdapter } from './usdamars';
import { AdsbdbAdapter } from './adsbdb';
import { FaoAdapter } from './fao';
import { ClinicalTrialsAdapter } from './clinicaltrials';
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
 * Read a provider credential from config, treating an empty string or the
 * `MANUAL_REQUIRED` placeholder (used in `.env` for un-provisioned keys) as
 * absent. Without this, a placeholder value is truthy, so a provider gets an
 * adapter built around a bogus credential and surfaces a confusing upstream
 * 401 (or "Unsupported tool" 502) instead of a clean "not configured" 503.
 */
function cfgKey(name: string): string | undefined {
  const v = (config as Record<string, unknown>)[name];
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (!trimmed || trimmed === 'MANUAL_REQUIRED') return undefined;
  return trimmed;
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
      const key = cfgKey('PROVIDER_KEY_OPENWEATHER');
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
      // O*NET key is optional — BLS, ESCO, CareerJet work without it.
      // Don't block the entire adapter just because O*NET is MANUAL_REQUIRED.
      const onetKey = (config as Record<string, unknown>).PROVIDER_KEY_ONET as string | undefined;
      const effectiveOnetKey = onetKey && onetKey !== 'MANUAL_REQUIRED' ? onetKey : undefined;
      const blsKey = (config as Record<string, unknown>).PROVIDER_KEY_BLS as string | undefined;
      const cjKey = (config as Record<string, unknown>).PROVIDER_KEY_CAREERJET as
        | string
        | undefined;
      return getOrCreate(
        'jobs',
        () => new JobsAdapter(effectiveOnetKey as string, blsKey || undefined, cjKey || undefined),
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
    case 'smithsonian': {
      const smKey = (config as Record<string, unknown>).PROVIDER_KEY_SMITHSONIAN as
        | string
        | undefined;
      if (!smKey) return undefined;
      return getOrCreate('smithsonian', () => new SmithsonianAdapter(smKey));
    }
    case 'jpl':
      // JPL SSD APIs are open access — no API key needed
      return getOrCreate('jpl', () => new JplAdapter());
    case 'soil':
      // USDA Soil Data Access — US Gov open data, no auth, unlimited
      return getOrCreate('soil', () => new SoilAdapter());
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
    case 'telnyx': {
      // Telnyx CPaaS — SMS/voice via Bearer API key v2 (UC-395)
      const telnyxKey = (config as Record<string, unknown>).TELNYX_API_KEY as string | undefined;
      if (!telnyxKey) return undefined;
      return getOrCreate('telnyx', () => new TelnyxAdapter(telnyxKey));
    }
    case 'swpc':
      // NOAA SWPC — space weather (K-index, aurora, solar wind, regions), no auth, NODD (UC-396)
      return getOrCreate('swpc', () => new SwpcAdapter());
    case 'bible':
      // Free Use Bible API — 1000+ public-domain Bible translations, MIT, no auth (UC-399)
      return getOrCreate('bible', () => new BibleAdapter());
    case 'gutendex':
      // Gutendex — Project Gutenberg JSON wrapper, MIT, no auth (UC-400)
      return getOrCreate('gutendex', () => new GutendexAdapter());
    case 'librivox':
      // LibriVox — 20K+ public-domain audiobooks, no auth (UC-401)
      return getOrCreate('librivox', () => new LibriVoxAdapter());
    case 'tatoeba':
      // Tatoeba — 13M parallel sentences, CC-BY 2.0 FR, no auth (UC-402)
      return getOrCreate('tatoeba', () => new TatoebaAdapter());
    case 'loc':
      // US Library of Congress — 415K+ digitized historical items, public domain, no auth (UC-409)
      return getOrCreate('loc', () => new LocAdapter());
    case 'ukpolice':
      // UK Police — crime data, OGL v3.0, no auth (UC-411)
      return getOrCreate('ukpolice', () => new UkPoliceAdapter());
    case 'brasilapi':
      // BrasilAPI — Brazilian gov (CNPJ/CEP/banks/PIX), MIT, no auth (UC-403)
      return getOrCreate('brasilapi', () => new BrasilApiAdapter());
    case 'ibge':
      // IBGE — Brazilian census/geography, CC BY 4.0, no auth (UC-404)
      return getOrCreate('ibge', () => new IbgeAdapter());
    case 'bcb':
      // Banco Central do Brasil SGS — financial time-series, ODbL, no auth (UC-405)
      return getOrCreate('bcb', () => new BcbAdapter());
    case 'eurostat':
      // Eurostat — 35K+ EU stat datasets, CC BY 4.0, no auth (UC-410)
      return getOrCreate('eurostat', () => new EurostatAdapter());
    case 'sg':
      // Singapore data.gov.sg — NEA/LTA real-time data, SG Open Data Licence v1.0 (UC-412)
      return getOrCreate('datagovsg', () => new DataGovSgAdapter());
    case 'airnow': {
      // AirNow EPA — US AQI observations + forecasts (UC-397)
      const k = (config as Record<string, unknown>).PROVIDER_KEY_AIRNOW as string | undefined;
      if (!k) return undefined;
      return getOrCreate('airnow', () => new AirNowAdapter(k));
    }
    case 'nps': {
      // US National Park Service — parks, alerts, campgrounds, things-to-do (UC-406)
      const k = (config as Record<string, unknown>).PROVIDER_KEY_NPS as string | undefined;
      if (!k) return undefined;
      return getOrCreate('nps', () => new NpsAdapter(k));
    }
    case 'eia': {
      // US Energy Information Administration — electricity, petroleum, natural gas (UC-407)
      const k = (config as Record<string, unknown>).PROVIDER_KEY_EIA as string | undefined;
      if (!k) return undefined;
      return getOrCreate('eia', () => new EiaAdapter(k));
    }
    case 'fec': {
      // US Federal Election Commission — campaign finance via api.data.gov shared key (UC-408)
      const k = (config as Record<string, unknown>).PROVIDER_KEY_API_DATA_GOV as string | undefined;
      if (!k) return undefined;
      return getOrCreate('fec', () => new FecAdapter(k));
    }
    case 'fcc': {
      // FCC Open Data — Census Block geo + ECFS regulatory filings via api.data.gov key (UC-455)
      const k = (config as Record<string, unknown>).PROVIDER_KEY_API_DATA_GOV as string | undefined;
      if (!k) return undefined;
      return getOrCreate('fcc', () => new FccAdapter(k));
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
    case 'irctc': {
      // Reuses the shared RapidAPI key (UC-426). Without this case all
      // irctc.* tools 503 "No adapter registered" despite being seeded.
      const rapidKey = (config as Record<string, unknown>).PROVIDER_KEY_RAPIDAPI as
        | string
        | undefined;
      if (!rapidKey) return undefined;
      return getOrCreate('irctc', () => new IrctcAdapter(rapidKey));
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
      // Legacy alias — reroutes old 'clinical.*' tool prefix to the same adapter
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
    case 'sdwis':
      // EPA SDWIS — Safe Drinking Water Information System, no auth (UC-508)
      return getOrCreate('sdwis', () => new SdwisAdapter());
    case 'bls-macro': {
      // BLS Macro — CPI, unemployment, payrolls, generic series (UC-509)
      const blsKey = (config as Record<string, unknown>).PROVIDER_KEY_BLS as string | undefined;
      return getOrCreate('bls-macro', () => new BlsMacroAdapter(blsKey ?? ''));
    }
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
    case 'dblp':
      // DBLP — CS bibliography, 7M+ papers, 3M+ authors, CC0, no auth (UC-370)
      return getOrCreate('dblp', () => new DblpAdapter());
    case 'tides':
      // NOAA Tides & Currents — tide predictions + water levels, no auth (UC-374)
      return getOrCreate('noaa-tides', () => new NoaaTidesAdapter());
    case 'met':
      // Met Museum — 470K+ artworks, CC0 public domain, no auth (UC-373)
      return getOrCreate('met-museum', () => new MetMuseumAdapter());
    case 'rijks':
      // Rijksmuseum — 800K+ artworks, Linked Open Data API, CC-BY, no auth (UC-379)
      return getOrCreate('rijksmuseum', () => new RijksmuseumAdapter());
    case 'cma':
      // Cleveland Museum of Art — 64K+ artworks, CC0, no auth (UC-381)
      return getOrCreate('cma', () => new CmaAdapter());
    case 'razorpayifsc':
      // Razorpay IFSC — Indian bank branch lookup, MIT, no auth (UC-425)
      return getOrCreate('razorpayifsc', () => new RazorpayIfscAdapter());
    case 'lichess':
      // Lichess — chess platform: user profiles, top players, daily puzzle, no auth (UC-416)
      return getOrCreate('lichess', () => new LichessAdapter());
    case 'chesscom':
      // Chess.com Public Data API — player profiles, stats, titled players, no auth (UC-417)
      return getOrCreate('chesscom', () => new ChesscomAdapter());
    case 'awc':
      // NOAA Aviation Weather Center — METAR/TAF/SIGMET, no auth, US public domain (UC-422)
      return getOrCreate('awc', () => new AwcAdapter());
    case 'ukfsa':
      // UK Food Standards Agency — Food Hygiene Rating Scheme, OGL v3, no auth (UC-429)
      return getOrCreate('ukfsa', () => new UkfsaAdapter());
    case 'govuk':
      // GOV.UK Content API — 700K+ UK government documents, OGL v3, no auth (UC-430)
      return getOrCreate('govuk', () => new GovukAdapter());
    case 'scb':
      // Statistics Sweden (SCB) PXWeb API — open national statistics, no auth (UC-431)
      return getOrCreate('scb', () => new ScbAdapter());
    case 'nvd': {
      // NIST National Vulnerability Database — CVE/CPE canonical records (UC-413)
      const nvdKey = (config as Record<string, unknown>).PROVIDER_KEY_NVD as string | undefined;
      if (!nvdKey) return undefined;
      return getOrCreate('nvd', () => new NvdAdapter(nvdKey));
    }
    case 'usajobs': {
      // USAJOBS — Office of Personnel Management, US federal civil-service postings (UC-415)
      const usajobsKey = (config as Record<string, unknown>).PROVIDER_KEY_USAJOBS as
        | string
        | undefined;
      if (!usajobsKey) return undefined;
      return getOrCreate('usajobs', () => new UsajobsAdapter(usajobsKey));
    }
    case 'nrel': {
      // NREL — AFDC (EV chargers) + PVWatts (solar) (UC-414) — 1000 req/hour shared
      const nrelKey = (config as Record<string, unknown>).PROVIDER_KEY_NREL as string | undefined;
      if (!nrelKey) return undefined;
      return getOrCreate('nrel', () => new NrelAdapter(nrelKey));
    }
    case 'opendota': {
      // OpenDota — Dota 2 statistics API (UC-418) — unlimited/day, 3000 req/min
      const opendotaKey = (config as Record<string, unknown>).PROVIDER_KEY_OPENDOTA as
        | string
        | undefined;
      if (!opendotaKey) return undefined;
      return getOrCreate('opendota', () => new OpenDotaAdapter(opendotaKey));
    }
    case 'checkwx': {
      // CheckWX Aviation Weather — pre-decoded METAR/TAF/station JSON (UC-423)
      const checkwxKey = (config as Record<string, unknown>).PROVIDER_KEY_CHECKWX as
        | string
        | undefined;
      if (!checkwxKey) return undefined;
      return getOrCreate('checkwx', () => new CheckWxAdapter(checkwxKey));
    }
    case 'avwx': {
      // AVWX Aviation Weather — parsed NOTAMs + PIREPs + station summary (UC-424)
      const avwxKey = (config as Record<string, unknown>).PROVIDER_KEY_AVWX as string | undefined;
      if (!avwxKey) return undefined;
      return getOrCreate('avwx', () => new AvwxAdapter(avwxKey));
    }
    case 'nihreporter':
      // NIH Reporter — NIH-funded research grants and publications, no auth (UC-454)
      return getOrCreate('nihreporter', () => new NihReporterAdapter());
    case 'nasaexoplanet':
      // NASA Exoplanet Archive TAP — 6298+ confirmed exoplanets, no auth (UC-456)
      return getOrCreate('nasaexoplanet', () => new NasaExoplanetAdapter());
    case 'unsdg':
      // UN SDG API — 17 goals, 231 indicators, time-series data, no auth (UC-457)
      return getOrCreate('unsdg', () => new UnsdgAdapter());
    case 'datacite':
      // DataCite REST API — 70M+ DOI metadata, research data registry, no auth (UC-458)
      return getOrCreate('datacite', () => new DataCiteAdapter());
    case 'ssbnorway':
      // Statistics Norway (SSB) PXWeb API — 300K+ time-series tables, no auth (UC-459)
      return getOrCreate('ssbnorway', () => new SsbNorwayAdapter());
    case 'overpass':
      // Overpass API — OpenStreetMap geospatial query engine, no auth (UC-460)
      return getOrCreate('overpass', () => new OverpassAdapter());
    case 'zenodo':
      // Zenodo — open-access research repository (CERN/OpenAIRE), no auth (UC-461)
      return getOrCreate('zenodo', () => new ZenodoAdapter());
    case 'nasantrs':
      // NASA Technical Reports Server — 645K+ space/aeronautics reports, no auth (UC-474)
      return getOrCreate('nasantrs', () => new NasaNtrsAdapter());
    case 'cernopendata':
      // CERN Open Data — 80K+ physics records, particle physics datasets, no auth (UC-475)
      return getOrCreate('cernopendata', () => new CernOpenDataAdapter());
    case 'celestrak':
      // CelesTrak GP — NORAD two-line element sets for 27000+ satellites, no auth (UC-476)
      return getOrCreate('celestrak', () => new CelesTrakAdapter());
    case 'eonet':
      // NASA EONET v3 — natural event tracking (wildfires, storms, floods, etc.), no auth (UC-477)
      return getOrCreate('eonet', () => new EonetAdapter());
    case 'rxnorm':
      // RxNorm — NIH NLM drug nomenclature, RxCUI lookup, NDC status, drug classification, no auth (UC-478)
      return getOrCreate('rxnorm', () => new RxNormAdapter());
    case 'mygene':
      // MyGene.info — BioThings gene annotation API, NCBI/Ensembl IDs, GO/pathway data, no auth (UC-479)
      return getOrCreate('mygene', () => new MyGeneAdapter());
    case 'myvariant':
      // MyVariant.info — BioThings variant annotation API, ClinVar/gnomAD/CADD scores, no auth (UC-480)
      return getOrCreate('myvariant', () => new MyVariantAdapter());
    case 'mychem':
      // MyChem.info — BioThings chemical annotation API, 197M+ compounds, DrugBank/ChEMBL/PubChem, no auth (UC-481)
      return getOrCreate('mychem', () => new MyChemAdapter());
    case 'drought':
    case 'drought-monitor':
      return getOrCreate('drought-monitor', () => new DroughtMonitorAdapter());
    case 'europepmc':
      // Europe PMC — EBI biomedical literature API, 42M+ articles, no auth (UC-490)
      return getOrCreate('europepmc', () => new EuropepmcAdapter());
    case 'ror':
      // ROR — Research Organization Registry, 110K+ orgs, no auth (UC-491)
      return getOrCreate('ror', () => new RorAdapter());
    case 'col':
      // Catalogue of Life — ~10M known species, CC BY 4.0, no auth (UC-492)
      return getOrCreate('col', () => new CatalogueOfLifeAdapter());
    case 'opencontext':
      // Open Context — archaeological open data, 200K+ finds/sites/projects, CC BY 4.0, no auth (UC-493)
      return getOrCreate('opencontext', () => new OpenContextAdapter());
    case 'wto':
      // WTO Timeseries API — trade/tariff statistics, 58 indicators, 288 economies (UC-494)
      return getOrCreate(
        'wto',
        () =>
          new WtoAdapter(
            process.env.PROVIDER_KEY_WTO ?? '',
            process.env.PROVIDER_KEY_WTO_SECONDARY ?? '',
          ),
      );
    case 'insee':
      // INSEE Sirene API — French company/establishment registry, SIREN/SIRET lookup (UC-495)
      return getOrCreate('insee', () => new InseeAdapter(process.env.PROVIDER_KEY_INSEE ?? ''));
    case 'bhl':
      // Biodiversity Heritage Library — public-domain natural-history literature (UC-496)
      return getOrCreate('bhl', () => new BhlAdapter(process.env.PROVIDER_KEY_BHL ?? ''));
    case 'gfw':
      // Global Fishing Watch — vessel tracking, AIS fishing events, fishing effort (UC-497)
      return getOrCreate('gfw', () => new GfwAdapter(process.env.PROVIDER_KEY_GFW ?? ''));
    case 'openstates':
      // OpenStates (UC-498) — US state legislative data; bills, legislators, committees
      return getOrCreate(
        'openstates',
        () => new OpenstatesAdapter(process.env.PROVIDER_KEY_OPENSTATES ?? ''),
      );
    case 'vam':
      // Victoria and Albert Museum (UC-499) — 1M+ collection objects, no auth
      return getOrCreate('vam', () => new VamAdapter());
    case 'pharmgkb':
      // PharmGKB (UC-500) — pharmacogenomics gene/drug/variant DB, no auth
      return getOrCreate('pharmgkb', () => new PharmGkbAdapter());
    case 'brreg':
      // Brreg (UC-501) — Norway business registry, 1M+ entities, no auth
      return getOrCreate('brreg', () => new BrregAdapter());
    case 'worms':
      // WoRMS (UC-502) — World Register of Marine Species, 240K+ taxa, no auth
      return getOrCreate('worms', () => new WormsAdapter());
    case 'bankofcanada':
      // Bank of Canada (UC-503) — CAD FX rates, overnight/prime rate, CPI inflation, no auth
      return getOrCreate('bankofcanada', () => new BankOfCanadaAdapter());
    case 'opensensemap':
      // OpenSenseMap (UC-504) — 15K+ crowdsourced env sensor stations, PM2.5/temp/humidity/UV, no auth
      return getOrCreate('opensensemap', () => new OpenSenseMapAdapter());
    case 'openfda_devices': {
      // OpenFDA Devices (UC-505) — FDA medical device recalls, 510(k) clearances, MAUDE adverse events, classification
      const fdaKey = (config as Record<string, unknown>).PROVIDER_KEY_OPENFDA as string | undefined;
      return getOrCreate('openfda_devices', () => new OpenFdaDevicesAdapter(fdaKey || ''));
    }
    case 'marine':
      // Open-Meteo Marine (UC-506) — wave height/direction/period, swell, sea surface temperature; no auth
      return getOrCreate('marine', () => new MarineAdapter());
    case 'mfapi':
      // MFAPI (UC-507) — 37K+ India mutual fund schemes, daily NAV history, no auth
      return getOrCreate('mfapi', () => new MfapiAdapter());
    case 'mbta-transit':
      // MBTA Transit (UC-510) — Boston MBTA real-time routes, stops, alerts, predictions; no auth
      return getOrCreate('mbta-transit', () => new MbtaTransitAdapter());
    case 'unhcr':
      // UNHCR Population (UC-511) — global refugee/displaced-person statistics 1951–present, no auth
      return getOrCreate('unhcr', () => new UnhcrAdapter());
    case 'geonames':
      // GeoNames geographical database (UC-512) — place search, postal codes, country info, timezones
      return getOrCreate(
        'geonames',
        () => new GeoNamesAdapter(process.env.GEONAMES_USERNAME ?? 'APIbase'),
      );
    case 'carbonintensity':
      // UK National Grid Carbon Intensity (UC-513) — real-time intensity, generation mix, regional, 24h forecast; no auth
      return getOrCreate('carbonintensity', () => new CarbonIntensityUkAdapter());
    case 'opentopodata':
      // Open Topo Data (UC-514) — global elevation API: SRTM 90m/30m, NED 10m, EU-DEM 25m, ASTER 30m, GEBCO bathymetry; no auth
      return getOrCreate('opentopodata', () => new OpenTopoDataAdapter());
    case 'metno':
      // MET Norway (UC-515) — Norwegian Met Institute: 9-day forecast, nowcast, weather alerts, sunrise/moonrise; no auth
      return getOrCreate('metno', () => new MetNorwayAdapter());
    case 'frankfurter':
      // Frankfurter.dev (UC-516) — ECB exchange rates, 33 currencies, historical since 1999; no auth
      return getOrCreate('frankfurter', () => new FrankfurterAdapter());
    case 'sunrisesunset':
      // SunriseSunset.io (UC-517) — sunrise/sunset/moon phase/golden hour/sun position; no auth
      return getOrCreate('sunrisesunset', () => new SunriseSunsetAdapter());
    case 'pokeapi':
      // PokéAPI (UC-518) — 800+ Pokemon: details, species, moves, type matchups; no auth
      return getOrCreate('pokeapi', () => new PokeApiAdapter());
    case 'samuni':
      // SA National Treasury Municipal (UC-519) — financial data for 257 SA municipalities; no auth
      return getOrCreate('samuni', () => new SaMuniAdapter());
    case 'tvmaze':
      // TVMaze (UC-520) — 25K+ TV shows: search, details, episodes, cast, schedules; CC BY-SA, no auth
      return getOrCreate('tvmaze', () => new TvMazeAdapter());
    case 'hackernews':
      // HackerNews Firebase (UC-521) — top/new/best stories, item details, user profiles; CC BY 3.0, no auth
      return getOrCreate('hackernews', () => new HackernewsAdapter());
    case 'hnalgolia':
      // HackerNews Algolia (UC-522) — full-text search over entire HN history; CC BY 3.0, no auth
      return getOrCreate('hnalgolia', () => new HnAlgoliaAdapter());
    case 'wikipedia':
      // Wikipedia REST API (UC-523) — 65M+ articles, summaries, search, media, daily feed; CC BY-SA 4.0, no auth
      return getOrCreate('wikipedia', () => new WikipediaAdapter());
    case 'irail':
      // iRail Belgium Rail (UC-524) — SNCB/NMBS stations, liveboards, connections, vehicle schedules, disturbances; no auth
      return getOrCreate('irail', () => new IrailAdapter());
    case 'norgesbank':
      // Norges Bank (UC-525) — FX rates (41 currencies vs NOK), key policy rates; SDMX REST, no auth
      return getOrCreate('norgesbank', () => new NorgesBankAdapter());
    case 'swissfso':
      // Swiss FSO (UC-526) — 648 datasets: population, employment, health, education; PxWeb, no auth
      return getOrCreate('swissfso', () => new SwissFsoAdapter());
    case 'treasuryfiscal':
      // US Treasury Fiscal Data (UC-527) — national debt, interest rates, quarterly yield, interest expense; no auth
      return getOrCreate('treasuryfiscal', () => new TreasuryFiscalAdapter());
    case 'usdamars':
      // USDA AMS MARS MyMarketNews (UC-528) — agricultural market reports: livestock, dairy, produce, grain; no auth
      return getOrCreate('usdamars', () => new UsdaMarsAdapter());
    case 'adsbdb':
      // ADS-B DB (UC-529) — aircraft/airline lookup by Mode-S/registration/callsign; MIT, no auth
      return getOrCreate('adsbdb', () => new AdsbdbAdapter());
    case 'faostat':
      // FAO FAOSTAT SDG API (UC-530) — food security, water stress, forest area, food loss; no auth
      return getOrCreate('faostat', () => new FaoAdapter());
    case 'clinicaltrials':
      // ClinicalTrials.gov v2 (UC-531) — 400K+ clinical trials search/detail; NIH US Gov, no auth
      return getOrCreate('clinicaltrials', () => new ClinicalTrialsAdapter());
    default:
      return undefined;
  }
}
