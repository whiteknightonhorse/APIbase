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
    case 'aviasales':
      // Aviasales adapter not yet implemented — return undefined
      return undefined;
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
      if (!onetKey) return undefined;
      const blsKey = (config as Record<string, unknown>).PROVIDER_KEY_BLS as string | undefined;
      const cjKey = (config as Record<string, unknown>).PROVIDER_KEY_CAREERJET as string | undefined;
      return getOrCreate('jobs', () => new JobsAdapter(onetKey, blsKey || undefined, cjKey || undefined));
    }
    default:
      return undefined;
  }
}
