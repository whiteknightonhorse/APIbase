import {
  HTTPFacilitatorClient,
  x402ResourceServer,
  type FacilitatorClient,
} from '@x402/core/server';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
// @x402/extensions/bazaar: TS can't resolve subpath exports but module exists at runtime
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const bazaarMod = require('@x402/extensions/bazaar') as any;
const bazaarResourceServerExtension = bazaarMod.bazaarResourceServerExtension;
import { getX402Config } from '../config/x402.config';
import { getCdpConfig } from '../config/cdp.config';
import { buildCdpAuthHeadersFn } from './cdp-jwt.service';
import { buildLocalFacilitatorClient } from '../payments/local-facilitator';
import { logger } from '../config/logger';

/**
 * Shared x402ResourceServer singleton factory.
 *
 * Three modes (controlled by X402_FACILITATOR_MODE + CDP_ENABLED):
 *   - mode=local: [LocalFacilitatorClient (with PayAI fallback)] — CDP-free, on-chain via viem.
 *   - mode=remote, CDP enabled: [CDP (primary), PayAI (fallback)] — Bazaar discovery + HTTP path.
 *   - mode=remote, CDP disabled: [PayAI only] — identical to pre-CDP behavior.
 *
 * NOTE: @x402/core's x402ResourceServer picks the FIRST client that supports a
 * (version, network, scheme) tuple — it does not iterate fallbacks itself. The
 * "fallback" semantics for mode=local are implemented inside
 * LocalFacilitatorClient (it tries local, catches, delegates to PayAI). For
 * mode=remote+CDP, only CDP runs and PayAI in the array is decorative until
 * the SDK gains true client iteration.
 */

let server: x402ResourceServer | null = null;

export function getSharedResourceServer(): x402ResourceServer {
  if (server) return server;

  const x402Cfg = getX402Config();
  const cdpCfg = getCdpConfig();

  const clients: FacilitatorClient[] = [];

  if (x402Cfg.facilitatorMode === 'local') {
    const localClient = buildLocalFacilitatorClient();
    clients.push(localClient);
    logger.info(
      { facilitator: 'local', network: x402Cfg.network, rpc: x402Cfg.baseRpcUrl },
      'x402: LOCAL facilitator registered as PRIMARY (self-hosted on-chain settle)',
    );
  } else {
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

    // PayAI — always present (primary when CDP disabled, decorative-fallback when CDP enabled)
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
  }

  server = new x402ResourceServer(clients);
  registerExactEvmScheme(server);

  // Register Bazaar extension only when CDP path is active
  if (x402Cfg.facilitatorMode === 'remote' && cdpCfg.enabled) {
    server.registerExtension(bazaarResourceServerExtension);
    logger.info('x402: Bazaar extension registered for CDP discovery');
  }

  logger.info(
    {
      clients: clients.length,
      mode: x402Cfg.facilitatorMode,
      cdpEnabled: cdpCfg.enabled,
    },
    'x402: ResourceServer initialized',
  );

  return server;
}

/** Reset singleton (for testing). */
export function resetSharedResourceServer(): void {
  server = null;
}
