import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { registerAgent } from '../services/agent.service';
import { getPrisma } from '../services/prisma.service';
import { hashApiKey, isValidApiKeyFormat } from '../services/api-key.service';
import { logger } from '../config/logger';

/**
 * OAuth 2.0 compatibility endpoints (§MCP auth spec 2025-03-26, RFC 6749, RFC 7591).
 *
 * Thin adapter on top of the existing API-key auth model:
 *   OAuth concept       APIbase model
 *   ---------------     -----------------------------
 *   client_id           agent_id (UUID)
 *   client_secret       api_key (ak_live_<32 hex>)
 *   access_token        same api_key (reused — no separate JWT)
 *   grant_type          client_credentials (only)
 *
 * Agents that prefer direct-API-key auth keep using Authorization: Bearer;
 * OAuth-speaking agents end up with the same credential via the standard dance.
 *
 * Defense in depth — TWO layers of rate limiting:
 *   1. Nginx `limit_req_zone oauth_limit` (5 r/s burst 20) — network-edge
 *   2. express-rate-limit (this file) — application-level, satisfies
 *      CodeQL `js/missing-rate-limiting` since CodeQL only inspects JS.
 */

export const oauthRouter = Router();

/**
 * Per-IP rate limiters. Both limiters emit RFC 6585 429 responses with
 * RFC 6749 §5.2 error shape for OAuth-client compatibility.
 */
const makeLimiter = (windowMs: number, max: number) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.set('Cache-Control', 'no-store').status(429).json({
        error: 'invalid_request',
        error_description: 'Too many requests — rate limit exceeded',
      });
    },
  });

// /oauth/register is more expensive (DB write + agent creation) — tighter limit.
const registerLimiter = makeLimiter(60_000, 10);
// /oauth/token is read-only DB lookup — slightly looser.
const tokenLimiter = makeLimiter(60_000, 30);

// RFC 6749 §5.2 token error response
interface OAuthError {
  error:
    | 'invalid_request'
    | 'invalid_client'
    | 'invalid_grant'
    | 'unauthorized_client'
    | 'unsupported_grant_type'
    | 'invalid_scope'
    | 'server_error';
  error_description?: string;
}

function oauthError(res: Response, status: number, body: OAuthError): void {
  res.set('Cache-Control', 'no-store').status(status).json(body);
}

/**
 * POST /oauth/register — RFC 7591 Dynamic Client Registration.
 *
 * Creates a new agent and returns RFC 7591 client credentials.
 * No client authentication is required on this endpoint (open DCR) — abuse is
 * controlled by the Nginx oauth_limit zone and by agent status revocation.
 */
oauthRouter.post('/oauth/register', registerLimiter, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const clientName =
      typeof body.client_name === 'string' ? body.client_name : 'anonymous-oauth-client';
    const clientVersion =
      typeof body.software_version === 'string' ? body.software_version : '1.0.0';

    const registered = await registerAgent({
      agentName: clientName,
      agentVersion: clientVersion,
    });

    const issuedAt = Math.floor(Date.now() / 1000);

    logger.info(
      { agentId: registered.agent_id, clientName, via: 'oauth/register' },
      'OAuth dynamic client registration',
    );

    res
      .set('Cache-Control', 'no-store')
      .status(201)
      .json({
        client_id: registered.agent_id,
        client_secret: registered.api_key,
        client_id_issued_at: issuedAt,
        client_secret_expires_at: 0, // 0 = never expires per RFC 7591
        grant_types: ['client_credentials'],
        token_endpoint_auth_method: 'client_secret_post',
        client_name: clientName,
      });
  } catch (err) {
    logger.error({ err }, 'OAuth /register failed');
    oauthError(res, 500, {
      error: 'server_error',
      error_description: 'Registration failed',
    });
  }
});

/**
 * POST /oauth/token — RFC 6749 §4.4 Client Credentials Grant.
 *
 * Accepts client_id + client_secret via:
 *   - application/x-www-form-urlencoded body (client_secret_post), OR
 *   - application/json body (non-standard but widely tolerated), OR
 *   - Authorization: Basic base64(client_id:client_secret) (client_secret_basic)
 *
 * Returns the same api_key as the access_token. No JWT, no separate issuance
 * pipeline — the credential IS the api_key, reused.
 */
oauthRouter.post('/oauth/token', tokenLimiter, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // Extract grant_type, client_id, client_secret from body OR Basic auth header.
    let clientId: string | undefined;
    let clientSecret: string | undefined;

    const basic = extractBasicAuth(req.headers.authorization);
    if (basic) {
      clientId = basic.clientId;
      clientSecret = basic.clientSecret;
    } else {
      if (typeof body.client_id === 'string') clientId = body.client_id;
      if (typeof body.client_secret === 'string') clientSecret = body.client_secret;
    }

    const grantType = typeof body.grant_type === 'string' ? body.grant_type : undefined;

    if (!grantType) {
      return oauthError(res, 400, {
        error: 'invalid_request',
        error_description: 'grant_type is required',
      });
    }
    if (grantType !== 'client_credentials') {
      return oauthError(res, 400, {
        error: 'unsupported_grant_type',
        error_description: 'Only client_credentials grant is supported',
      });
    }
    if (!clientId || !clientSecret) {
      return oauthError(res, 401, {
        error: 'invalid_client',
        error_description: 'client_id and client_secret are required',
      });
    }

    // Validate api_key format before hitting DB.
    if (!isValidApiKeyFormat(clientSecret)) {
      return oauthError(res, 401, {
        error: 'invalid_client',
        error_description: 'Invalid client_secret format',
      });
    }

    // Lookup by hash(api_key) — same pattern as authMiddleware.
    const keyHash = hashApiKey(clientSecret);
    const agent = await getPrisma().agent.findUnique({
      where: { api_key_hash: keyHash },
      select: { agent_id: true, status: true },
    });

    if (!agent || agent.agent_id !== clientId) {
      return oauthError(res, 401, {
        error: 'invalid_client',
        error_description: 'client_id / client_secret pair does not match',
      });
    }

    if (agent.status !== 'active') {
      return oauthError(res, 401, {
        error: 'invalid_client',
        error_description: `Agent is ${agent.status}`,
      });
    }

    logger.info({ agentId: agent.agent_id, via: 'oauth/token' }, 'OAuth access token issued');

    // access_token is the same api_key. 10-year expires_in (our keys don't expire).
    return void res.set('Cache-Control', 'no-store').status(200).json({
      access_token: clientSecret,
      token_type: 'Bearer',
      expires_in: 315360000,
    });
  } catch (err) {
    logger.error({ err }, 'OAuth /token failed');
    return oauthError(res, 500, {
      error: 'server_error',
      error_description: 'Token issuance failed',
    });
  }
});

function extractBasicAuth(
  header: string | undefined,
): { clientId: string; clientSecret: string } | null {
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'basic') return null;
  try {
    const decoded = Buffer.from(parts[1], 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep < 0) return null;
    return {
      clientId: decoded.slice(0, sep),
      clientSecret: decoded.slice(sep + 1),
    };
  } catch {
    return null;
  }
}
