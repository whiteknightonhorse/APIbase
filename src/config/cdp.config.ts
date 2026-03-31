import { config } from './index';

export interface CdpFacilitatorConfig {
  readonly enabled: boolean;
  readonly apiKeyId: string;
  readonly apiKeySecret: string;
  readonly facilitatorUrl: string;
}

let frozen: CdpFacilitatorConfig | null = null;

/**
 * CDP (Coinbase Developer Platform) x402 facilitator config.
 *
 * When enabled, CDP is used as PRIMARY facilitator (for Bazaar discovery),
 * with PayAI as FALLBACK. When disabled, PayAI-only (current behavior).
 *
 * Toggle: CDP_ENABLED=true/false in .env
 */
export function getCdpConfig(): CdpFacilitatorConfig {
  if (!frozen) {
    const keyId = (config as Record<string, unknown>).CDP_API_KEY_ID as string | undefined;
    const keySecret = (config as Record<string, unknown>).CDP_API_KEY_SECRET as string | undefined;
    const enabledRaw = (config as Record<string, unknown>).CDP_ENABLED as string | undefined;
    const url = (config as Record<string, unknown>).CDP_FACILITATOR_URL as string | undefined;

    // PEM keys stored in .env with literal \n — reconstitute newlines
    const secret = keySecret ? keySecret.replace(/\\n/g, '\n') : '';

    frozen = Object.freeze({
      enabled: enabledRaw === 'true' && !!keyId && !!secret,
      apiKeyId: keyId ?? '',
      apiKeySecret: secret,
      facilitatorUrl: url || 'https://api.cdp.coinbase.com/platform/v2/x402',
    });
  }
  return frozen;
}
