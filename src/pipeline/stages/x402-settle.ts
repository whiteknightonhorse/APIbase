import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload, isPaymentPayloadV1 } from '@x402/core/schemas';
// @x402/extensions/bazaar: TS can't resolve subpath exports but module exists at runtime
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const bazaarMod = require('@x402/extensions/bazaar') as any;
const declareDiscoveryExtension = bazaarMod.declareDiscoveryExtension as (opts: {
  toolName: string;
  description: string;
  transport: string;
}) => Record<string, unknown>;
import { getX402Config, buildServerX402Requirements } from '../../config/x402.config';
import { getCdpConfig } from '../../config/cdp.config';
import { getSharedResourceServer } from '../../services/x402-server.service';
import { TOOL_DEFINITIONS } from '../../mcp/tool-definitions';
import { logger } from '../../config/logger';
import type { PipelineContext } from '../types';

/**
 * Look up human description for a toolId, fall back to generic label.
 * Used to populate V1 `requirements.description` so CDP Bazaar indexes
 * each tool with a meaningful string.
 */
function lookupToolDescription(toolId: string): string {
  const def = TOOL_DEFINITIONS.find((d) => d.toolId === toolId);
  return def?.description ?? `APIbase MCP tool: ${toolId}`;
}

/**
 * Settle x402 on-chain payment after successful provider call (§8.9).
 * Best-effort: failure logs a warning but does NOT abort the pipeline.
 * The payment was already verified in middleware, provider was already called,
 * and the agent received their data — settlement failure is a revenue leak,
 * not a user-facing error.
 */
export async function settleX402(ctx: PipelineContext): Promise<void> {
  if (!ctx.x402PaymentHeader) return;
  // Free tools never settle on-chain — guard against an amount:0
  // transferWithAuthorization (issue #103 red-team).
  if ((ctx.toolPrice ?? 0) <= 0) return;

  try {
    const decoded = decodePaymentSignatureHeader(ctx.x402PaymentHeader);
    const parsed = parsePaymentPayload(decoded);

    if (!parsed.success) {
      logger.warn({ requestId: ctx.requestId }, 'x402 settle: failed to re-parse payment payload');
      return;
    }

    const payload = parsed.data;
    const cfg = getX402Config();

    let requirements: {
      scheme: string;
      network: string;
      asset: string;
      amount: string;
      payTo: string;
      maxTimeoutSeconds: number;
      extra: Record<string, unknown>;
      // V1 Bazaar discovery fields (optional — only populated on V1 branch)
      maxAmountRequired?: string;
      resource?: string;
      description?: string;
      mimeType?: string;
      outputSchema?: Record<string, unknown>;
    };

    if (isPaymentPayloadV1(payload)) {
      const amountMicro = String(Math.round((ctx.toolPrice ?? 0) * 1_000_000));
      const toolId = ctx.toolId ?? 'mcp.call';
      const description = lookupToolDescription(toolId);
      const resourceUrl = `https://apibase.pro/api/v1/tools/${toolId}/call`;

      requirements = {
        scheme: payload.scheme,
        network: payload.network,
        asset: cfg.usdcAddress,
        // Keep `amount` for backwards-compat with current CDP settle acceptance.
        amount: amountMicro,
        // V1 canonical fields required by CDP Bazaar extractDiscoveryInfoV1
        // (@x402/extensions/bazaar/index.js:404-450). Without these, CDP
        // returns null from the V1 discovery-extractor and the merchant never
        // appears in the Bazaar catalog.
        maxAmountRequired: amountMicro,
        resource: resourceUrl,
        description,
        mimeType: 'application/json',
        payTo: cfg.paymentAddress,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
        extra: { name: 'USD Coin', version: '2' },
        outputSchema: {
          input: {
            type: 'http',
            method: 'POST',
            bodyType: 'json',
            bodyFields: {
              toolId: { type: 'string', description: 'APIbase tool identifier' },
              arguments: {
                type: 'object',
                description:
                  'Tool-specific arguments. See /api/v1/tools for per-tool JSON schemas.',
              },
            },
            discoverable: true,
          },
        },
      };
    } else {
      // v2: settle against SERVER-trusted requirements (NOT client
      // payload.accepted — issue #103). ESCROW already verified the signed
      // authorization matches these exact values, so settle succeeds.
      requirements = buildServerX402Requirements(ctx.toolPrice ?? 0);
    }

    const server = getSharedResourceServer();

    // Build Bazaar discovery extensions for CDP catalog auto-registration
    let bazaarExtensions: Record<string, unknown> | undefined;
    if (getCdpConfig().enabled && ctx.toolId) {
      bazaarExtensions = declareDiscoveryExtension({
        toolName: ctx.toolId,
        description: `Tool invocation: ${ctx.toolId}`,
        transport: 'streamable-http',
      });
    }

    const result = await server.settlePayment(
      payload as never,
      requirements as never,
      bazaarExtensions as never,
    );

    if (result.success) {
      logger.info(
        { requestId: ctx.requestId, payer: ctx.x402Payer },
        'x402 settle: payment settled successfully',
      );
    } else {
      logger.warn(
        { requestId: ctx.requestId, payer: ctx.x402Payer, error: result.errorMessage },
        'x402 settle: settlement returned failure',
      );
    }
  } catch (error) {
    logger.warn(
      { requestId: ctx.requestId, error: (error as Error).message },
      'x402 settle: settlement call failed (best-effort)',
    );
  }
}
