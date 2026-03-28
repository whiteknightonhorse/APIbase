/**
 * Predictive Pre-fetching Rules (F8).
 *
 * Static rules mapping tool_id → follow-up tools to pre-fetch.
 * deriveParams extracts parameters from the original request body
 * to construct the pre-fetch request.
 *
 * Only free/cheap upstream tools for Phase 1 — platform absorbs cost.
 */

export interface PrefetchRule {
  toolId: string;
  deriveParams: (body: Record<string, unknown>) => Record<string, unknown> | null;
}

export const PREFETCH_RULES: Record<string, PrefetchRule[]> = {
  'aviasales.search_flights': [
    {
      toolId: 'finance.exchange_rates',
      deriveParams: (body) => {
        const currency = body.currency as string | undefined;
        if (!currency || currency === 'USD') return null;
        return { from: 'USD', to: currency };
      },
    },
  ],

  'usrealestate.for_sale': [
    {
      toolId: 'walkscore.score',
      deriveParams: (body) => {
        const address = body.city as string | undefined;
        const lat = body.lat as number | undefined;
        const lon = body.lon as number | undefined;
        if (!address && (!lat || !lon)) return null;
        return { address: address || '', lat, lon };
      },
    },
  ],

  'geo.geocode': [
    {
      toolId: 'country.search',
      deriveParams: (body) => {
        const country = body.country as string | undefined;
        if (!country) return null;
        return { query: country };
      },
    },
  ],
};
