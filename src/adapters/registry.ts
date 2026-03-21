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
import { FirmsAdapter } from './firms';
import { ResendAdapter } from './resend';
import { FedRegisterAdapter } from './fedregister';
import { CourtListenerAdapter } from './courtlistener';
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
      const key = (config as Record<string, unknown>).PROVIDER_KEY_OPENWEATHER as string | undefined;
      if (!key) return undefined;
      return getOrCreate('openweathermap', () => new OpenWeatherMapAdapter(key));
    }
    case 'crypto':
    case 'coingecko': {
      const cgKey = (config as Record<string, unknown>).PROVIDER_KEY_COINGECKO as string | undefined;
      if (!cgKey) return undefined;
      return getOrCreate('coingecko', () => new CoinGeckoAdapter(cgKey));
    }
    case 'aviasales': {
      const aviasalesToken = (config as Record<string, unknown>).PROVIDER_KEY_AVIASALES as string | undefined;
      if (!aviasalesToken) return undefined;
      return getOrCreate('aviasales', () => new AviasalesAdapter(aviasalesToken));
    }
    case 'sabre': {
      const clientId = (config as Record<string, unknown>).SABRE_CLIENT_ID as string | undefined;
      const clientSecret = (config as Record<string, unknown>).SABRE_CLIENT_SECRET as string | undefined;
      if (!clientId || !clientSecret) return undefined;
      return getOrCreate('sabre', () => new SabreAdapter(clientId, clientSecret));
    }
    case 'amadeus': {
      const apiKey = (config as Record<string, unknown>).AMADEUS_API_KEY as string | undefined;
      const apiSecret = (config as Record<string, unknown>).AMADEUS_API_SECRET as string | undefined;
      if (!apiKey || !apiSecret) return undefined;
      return getOrCreate('amadeus', () => new AmadeusAdapter(apiKey, apiSecret));
    }
    case 'foursquare': {
      const key = (config as Record<string, unknown>).PROVIDER_KEY_FOURSQUARE as string | undefined;
      if (!key) return undefined;
      return getOrCreate('foursquare', () => new FoursquareAdapter(key));
    }
    case 'ticketmaster': {
      const key = (config as Record<string, unknown>).PROVIDER_KEY_TICKETMASTER as string | undefined;
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
      const openFdaKey = (config as Record<string, unknown>).PROVIDER_KEY_OPENFDA as string | undefined;
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
      const cjKey = (config as Record<string, unknown>).PROVIDER_KEY_CAREERJET as string | undefined;
      return getOrCreate('jobs', () => new JobsAdapter(onetKey, blsKey || undefined, cjKey || undefined));
    }
    case 'education': {
      // All 5 providers are free; Scorecard uses DEMO_KEY by default, PubMed key is optional
      const scorecardKey = (config as Record<string, unknown>).PROVIDER_KEY_SCORECARD as string | undefined;
      const pubmedKey = (config as Record<string, unknown>).PROVIDER_KEY_PUBMED as string | undefined;
      return getOrCreate('education', () => new EducationAdapter(scorecardKey || undefined, pubmedKey || undefined));
    }
    case 'geo': {
      const geoKey = (config as Record<string, unknown>).PROVIDER_KEY_GEOAPIFY as string | undefined;
      if (!geoKey) return undefined;
      return getOrCreate('geo', () => new GeoAdapter(geoKey));
    }
    case 'aipush': {
      const aipushSecret = (config as Record<string, unknown>).AIPUSH_INTERNAL_SECRET as string | undefined;
      if (!aipushSecret) return undefined;
      const aipushUrl = (config as Record<string, unknown>).AIPUSH_INTERNAL_URL as string | undefined;
      return getOrCreate('aipush', () => new AIPushAdapter(aipushSecret, aipushUrl || undefined));
    }
    case 'diffbot': {
      const diffbotKey = (config as Record<string, unknown>).PROVIDER_KEY_DIFFBOT as string | undefined;
      if (!diffbotKey) return undefined;
      return getOrCreate('diffbot', () => new DiffbotAdapter(diffbotKey));
    }
    case 'whois': {
      const whoisKey = (config as Record<string, unknown>).PROVIDER_KEY_WHOISXML as string | undefined;
      if (!whoisKey) return undefined;
      return getOrCreate('whoisxml', () => new WhoisXmlAdapter(whoisKey));
    }
    case 'spoonacular': {
      const spoonKey = (config as Record<string, unknown>).PROVIDER_KEY_SPOONACULAR as string | undefined;
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
      const igdbClientSecret = (config as Record<string, unknown>).IGDB_CLIENT_SECRET as string | undefined;
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
      const zbKey = (config as Record<string, unknown>).PROVIDER_KEY_ZEROBOUNCE as string | undefined;
      if (!zbKey) return undefined;
      return getOrCreate('zerobounce', () => new ZeroBounceAdapter(zbKey));
    }
    case 'shorturl': {
      const sioKey = (config as Record<string, unknown>).PROVIDER_KEY_SHORTIO as string | undefined;
      if (!sioKey) return undefined;
      return getOrCreate('shortio', () => new ShortIoAdapter(sioKey));
    }
    case 'exchangerate': {
      const erKey = (config as Record<string, unknown>).PROVIDER_KEY_EXCHANGERATE as string | undefined;
      if (!erKey) return undefined;
      return getOrCreate('exchangerate', () => new ExchangeRateAdapter(erKey));
    }
    case 'calendarific': {
      const calKey = (config as Record<string, unknown>).PROVIDER_KEY_CALENDARIFIC as string | undefined;
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
      const flashKey = (config as Record<string, unknown>).PROVIDER_KEY_APIFLASH as string | undefined;
      if (!flashKey) return undefined;
      return getOrCreate('apiflash', () => new ApiFlashAdapter(flashKey));
    }
    case 'sports': {
      const sportsKey = (config as Record<string, unknown>).PROVIDER_KEY_APISPORTS as string | undefined;
      if (!sportsKey) return undefined;
      return getOrCreate('apisports', () => new ApiSportsAdapter(sportsKey));
    }
    case 'langbly': {
      const lbKey = (config as Record<string, unknown>).PROVIDER_KEY_LANGBLY as string | undefined;
      if (!lbKey) return undefined;
      return getOrCreate('langbly', () => new LangblyAdapter(lbKey));
    }
    case 'twilio': {
      const twilioSid = (config as Record<string, unknown>).TWILIO_ACCOUNT_SID as string | undefined;
      const twilioToken = (config as Record<string, unknown>).TWILIO_AUTH_TOKEN as string | undefined;
      if (!twilioSid || !twilioToken) return undefined;
      return getOrCreate('twilio', () => new TwilioAdapter(twilioSid, twilioToken));
    }
    case 'stability': {
      const stabKey = (config as Record<string, unknown>).PROVIDER_KEY_STABILITY as string | undefined;
      if (!stabKey) return undefined;
      return getOrCreate('stability', () => new StabilityAdapter(stabKey));
    }
    case 'resend': {
      const resendKey = (config as Record<string, unknown>).PROVIDER_KEY_RESEND as string | undefined;
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
      const ocrKey = (config as Record<string, unknown>).PROVIDER_KEY_OCRSPACE as string | undefined;
      if (!ocrKey) return undefined;
      return getOrCreate('ocrspace', () => new OcrSpaceAdapter(ocrKey));
    }
    case 'finnhub': {
      const fhKey = (config as Record<string, unknown>).PROVIDER_KEY_FINNHUB as string | undefined;
      if (!fhKey) return undefined;
      return getOrCreate('finnhub', () => new FinnhubAdapter(fhKey));
    }
    case 'news': {
      const newsKey = (config as Record<string, unknown>).PROVIDER_KEY_NEWSDATA as string | undefined;
      if (!newsKey) return undefined;
      return getOrCreate('newsdata', () => new NewsDataAdapter(newsKey));
    }
    case 'exa': {
      const exaKey = (config as Record<string, unknown>).PROVIDER_KEY_EXA as string | undefined;
      if (!exaKey) return undefined;
      return getOrCreate('exa', () => new ExaAdapter(exaKey));
    }
    case 'tavily': {
      const tavilyKey = (config as Record<string, unknown>).PROVIDER_KEY_TAVILY as string | undefined;
      if (!tavilyKey) return undefined;
      return getOrCreate('tavily', () => new TavilyAdapter(tavilyKey));
    }
    case 'serper': {
      const serperKey = (config as Record<string, unknown>).PROVIDER_KEY_SERPER as string | undefined;
      if (!serperKey) return undefined;
      return getOrCreate('serper', () => new SerperAdapter(serperKey));
    }
    case 'usrealestate': {
      const rapidKey = (config as Record<string, unknown>).PROVIDER_KEY_RAPIDAPI as string | undefined;
      if (!rapidKey) return undefined;
      return getOrCreate('usrealestate', () => new UsRealEstateAdapter(rapidKey));
    }
    case 'walkscore': {
      const wsKey = (config as Record<string, unknown>).PROVIDER_KEY_WALKSCORE as string | undefined;
      if (!wsKey) return undefined;
      return getOrCreate('walkscore', () => new WalkScoreAdapter(wsKey));
    }
    case 'airquality': {
      const iqairKey = (config as Record<string, unknown>).PROVIDER_KEY_IQAIR as string | undefined;
      if (!iqairKey) return undefined;
      return getOrCreate('iqair', () => new IqairAdapter(iqairKey));
    }
    default:
      return undefined;
  }
}
