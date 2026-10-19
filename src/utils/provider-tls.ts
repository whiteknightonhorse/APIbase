import https from 'https';
import providerLimitsConfig from '../config/provider-limits.json';

/**
 * T-0480: per-provider TLS configuration, read from the optional `tls` block of
 * a provider-limits.json entry. One helper, used by both the adapter transport
 * (base.adapter.ts) and the health probe (provider-health.job.ts).
 */
export interface ProviderTlsConfig {
  max_version?: 'TLSv1.2' | 'TLSv1.3';
}

const ALLOWED_KEYS = new Set(['max_version']);
const ALLOWED_MAX_VERSIONS = new Set(['TLSv1.2', 'TLSv1.3']);

const cache = new Map<string, https.Agent>();

function validate(provider: string, tls: unknown): ProviderTlsConfig {
  if (typeof tls !== 'object' || tls === null || Array.isArray(tls)) {
    throw new Error(`provider-limits.json: "${provider}".tls must be an object`);
  }
  for (const key of Object.keys(tls)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`provider-limits.json: "${provider}".tls has unsupported key "${key}"`);
    }
  }
  const maxVersion = (tls as Record<string, unknown>).max_version;
  if (
    maxVersion !== undefined &&
    (typeof maxVersion !== 'string' || !ALLOWED_MAX_VERSIONS.has(maxVersion))
  ) {
    throw new Error(
      `provider-limits.json: "${provider}".tls.max_version must be one of TLSv1.2, TLSv1.3`,
    );
  }
  return tls as ProviderTlsConfig;
}

/**
 * Returns a cached https.Agent for providers with a `tls` block, or undefined.
 * Fails closed (throws) on an unknown key or value. The optional `config`
 * argument exists for tests; production callers pass only the provider.
 */
export function providerHttpsAgent(
  provider: string,
  config: Record<string, { tls?: unknown }> = providerLimitsConfig as Record<
    string,
    { tls?: unknown }
  >,
): https.Agent | undefined {
  const entry = Object.prototype.hasOwnProperty.call(config, provider)
    ? config[provider]
    : undefined;
  if (!entry || entry.tls === undefined) return undefined;
  const useCache = config === (providerLimitsConfig as unknown);
  const cached = useCache ? cache.get(provider) : undefined;
  if (cached) return cached;
  const tls = validate(provider, entry.tls);
  const agent = new https.Agent(tls.max_version ? { maxVersion: tls.max_version } : {});
  if (useCache) cache.set(provider, agent);
  return agent;
}
