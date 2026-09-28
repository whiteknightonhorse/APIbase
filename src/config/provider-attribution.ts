/**
 * Provider attribution requirements (T-0218).
 *
 * Some upstream providers' licenses (or a direct licensor request) require
 * crediting them in every response, not just on the marketing site — CC
 * BY-SA 4.0 §3(a)(2) and ODbL §4.3 both call for attribution "in any
 * reasonable manner based on the medium", and for an M2M JSON response the
 * response body IS the medium an agent actually sees. Providers not listed
 * here have no such requirement; do not add an entry speculatively.
 */
export interface ProviderAttribution {
  provider: string;
  text: string;
  url: string;
  license: string;
}

export const PROVIDER_ATTRIBUTION: Record<string, ProviderAttribution> = {
  openweathermap: {
    provider: 'OpenWeather',
    text: 'Weather data provided by OpenWeather',
    url: 'https://openweathermap.org',
    license: 'CC BY-SA 4.0 / ODbL',
  },
};

/**
 * toolId dot-prefix -> PROVIDER_ATTRIBUTION key. The catalog's toolId
 * namespace (e.g. 'weather.get_current') doesn't always match the
 * adapter/registry provider key ('openweathermap') it resolves to, so this
 * is a separate, explicit mapping rather than assuming they're the same
 * string.
 */
const TOOL_PREFIX_TO_PROVIDER: Record<string, string> = {
  weather: 'openweathermap',
};

/** Look up the attribution for a tool by its dot-notation toolId prefix. */
export function getAttributionForTool(toolId: string | undefined): ProviderAttribution | null {
  if (!toolId) return null;
  const prefix = toolId.split('.')[0];
  const provider = TOOL_PREFIX_TO_PROVIDER[prefix];
  if (!provider) return null;
  return PROVIDER_ATTRIBUTION[provider] ?? null;
}
