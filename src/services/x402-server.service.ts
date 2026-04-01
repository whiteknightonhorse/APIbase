import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
// @x402/extensions/bazaar: TS can't resolve subpath exports but module exists at runtime
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const bazaarMod = require('@x402/extensions/bazaar') as any;
const bazaarResourceServerExtension = bazaarMod.bazaarResourceServerExtension;
import { getX402Config } from '../config/x402.config';
import { getCdpConfig } from '../config/cdp.config';
import { buildCdpAuthHeadersFn } from './cdp-jwt.service';
import { logger } from '../config/logger';

/**
 * Shared x402ResourceServer singleton factory.
 *
 * Dual-facilitator architecture:
 *   CDP enabled:  [CDP (primary), PayAI (fallback)] → Bazaar discovery + reliability
 *   CDP disabled: [PayAI only] → identical to pre-CDP behavior
 *
 * The @x402/core SDK iterates facilitator clients on verify/settle:
 *   - If first client succeeds → done
 *   - If first client throws → tries next client
 * This gives us CDP as primary (for Bazaar auto-registration) with automatic
 * PayAI fallback if CDP is down or auth fails.
 */

let server: x402ResourceServer | null = null;

export function getSharedResourceServer(): x402ResourceServer {
  if (server) return server;

  const x402Cfg = getX402Config();
  const cdpCfg = getCdpConfig();

  const clients: HTTPFacilitatorClient[] = [];

  if (cdpCfg.enabled) {
    const cdpClient = new HTTPFacilitatorClient({
      url: cdpCfg.facilitatorUrl,
      createAuthHeaders: buildCdpAuthHeadersFn(cdpCfg.apiKeyId, cdpCfg.apiKeySecret),
    } as ConstructorParameters<typeof HTTPFacilitatorClient>[0]);
    clients.push(cdpClient);
    logger.info(
      { facilitator: 'cdp', url: cdpCfg.facilitatorUrl },
      'x402: CDP facilitator registered as PRIMARY',
    );
  }

  // PayAI — always present (primary when CDP disabled, fallback when CDP enabled)
  const payaiClient = new HTTPFacilitatorClient({ url: x402Cfg.facilitatorUrl });
  clients.push(payaiClient);

  logger.info(
    {
      facilitator: 'payai',
      url: x402Cfg.facilitatorUrl,
      role: cdpCfg.enabled ? 'fallback' : 'primary',
    },
    `x402: PayAI facilitator registered as ${cdpCfg.enabled ? 'FALLBACK' : 'PRIMARY'}`,
  );

  server = new x402ResourceServer(clients);
  registerExactEvmScheme(server);

  // Register Bazaar extension for CDP discovery catalog auto-registration
  if (cdpCfg.enabled) {
    server.registerExtension(bazaarResourceServerExtension);
    logger.info('x402: Bazaar extension registered for CDP discovery');
  }

  logger.info(
    { clients: clients.length, cdpEnabled: cdpCfg.enabled },
    'x402: ResourceServer initialized',
  );

  return server;
}

/** Reset singleton (for testing). */
export function resetSharedResourceServer(): void {
  server = null;
}
