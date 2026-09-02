import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.middleware';
import { logger } from '../config/logger';
import { config } from '../config';
import {
  createPendingConnection,
  findPendingByState,
  activateConnection,
  listActiveConnections,
  revokeConnection,
} from '../services/device-connection.service';
import { exchangeTuyaCode } from '../pipeline/stages/device-oauth.stage';
import type { TuyaConfig } from '../adapters/device-tuya/tuya-client';

/**
 * Ф5 Connect-webview -- the ONLY place a user's vendor password touches a
 * browser, and it is the VENDOR's own login page, never ours. Pattern:
 *
 *   1. Agent calls POST /connect/device/tuya/start with its OWN api_key
 *      (Bearer) -> gets back an `authorize_url` bound to a fresh, random,
 *      single-use `state`.
 *   2. A human opens `authorize_url` in a real browser, logs into THEIR
 *      OWN Tuya account (we never see that password), and approves the
 *      link. Tuya redirects the browser to step 3 -- this hop carries no
 *      Authorization header (it's the user's browser, not our API caller),
 *      which is why `state` -- not a Bearer token -- is the CSRF/ownership
 *      binding on the callback, identical to how Google/GitHub OAuth
 *      callbacks work.
 *   3. GET /connect/device/tuya/callback?code&state -- looked up by `state`
 *      (random 256-bit, single-use, 10-minute TTL -- see
 *      device-connection.service.ts), the code is exchanged for tokens
 *      SERVER-SIDE, and the tokens are encrypted before they ever reach
 *      Postgres. The browser gets a plain human-readable result page, never
 *      the tokens themselves.
 *   4. GET /connect/device/connections and POST /connect/device/:id/revoke
 *      require the owning agent's Bearer key again, same as any other
 *      account-scoped endpoint in this API.
 */
export const deviceConnectRouter = Router();

const startLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const callbackLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

interface VendorDescriptor {
  id: string;
  name: string;
  status: 'live' | 'planned';
}

const VENDORS: VendorDescriptor[] = [
  { id: 'tuya', name: 'Tuya (Smart Life / Tuya Smart app)', status: 'live' },
  { id: 'smartthings', name: 'Samsung SmartThings', status: 'planned' },
  { id: 'aqara', name: 'Aqara Home', status: 'planned' },
];

/** GET /connect/device/vendors -- brand picker, no auth needed (no secrets). */
deviceConnectRouter.get('/connect/device/vendors', (_req: Request, res: Response) => {
  res.json({ vendors: VENDORS });
});

function tuyaCfgOrNull(): TuyaConfig | null {
  if (!config.TUYA_CLIENT_ID || !config.TUYA_CLIENT_SECRET || !config.TUYA_API_BASE_URL)
    return null;
  return {
    clientId: config.TUYA_CLIENT_ID,
    clientSecret: config.TUYA_CLIENT_SECRET,
    apiBaseUrl: config.TUYA_API_BASE_URL,
  };
}

/**
 * POST /connect/device/tuya/start -- agent-authenticated. Returns a
 * one-time authorize_url the agent hands to its human owner to open in a
 * real browser. TUYA_AUTHORIZE_URL is the H5 link Tuya issues once the
 * operator enables "OAuth 2.0 Authorization" for the Cloud Project in the
 * Tuya IoT console (that console UI is where the callback URL is
 * whitelisted -- see docs/OPERATOR-ACTION-device-vendor-tuya.md); we only
 * append our own `state`.
 */
deviceConnectRouter.post(
  '/connect/device/tuya/start',
  authMiddleware,
  startLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!config.TUYA_AUTHORIZE_URL || !tuyaCfgOrNull()) {
        res.status(503).json({
          error: 'service_unavailable',
          message: 'Tuya is not configured on this server yet',
        });
        return;
      }
      const agentId = req.agent?.agent_id;
      if (!agentId) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const { connectionId, state } = await createPendingConnection(agentId, 'tuya');
      const sep = config.TUYA_AUTHORIZE_URL.includes('?') ? '&' : '?';
      const authorizeUrl = `${config.TUYA_AUTHORIZE_URL}${sep}state=${encodeURIComponent(state)}`;
      logger.info(
        { agent_id: agentId, connection_id: connectionId },
        'device connect: tuya flow started',
      );
      res
        .status(201)
        .json({ connection_id: connectionId, authorize_url: authorizeUrl, expires_in_sec: 600 });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /connect/device/tuya/callback -- PUBLIC (the vendor's redirect lands
 * here with no Authorization header). Ownership + CSRF are proven entirely
 * by `state`. A missing/unknown/expired state is a fail-closed 400, never a
 * best-effort "try anyway".
 */
deviceConnectRouter.get(
  '/connect/device/tuya/callback',
  callbackLimiter,
  async (req: Request, res: Response) => {
    // Whole handler wrapped -- a plain browser GET with no auth header
    // means there is no upstream error-handler middleware pass for this
    // route the way an authenticated JSON endpoint gets; an unguarded
    // await throwing here (e.g. a real DB error inside findPendingByState)
    // must never become an unhandled async rejection.
    let pendingConnectionId: string | undefined;
    try {
      const code = typeof req.query.code === 'string' ? req.query.code : undefined;
      const state = typeof req.query.state === 'string' ? req.query.state : undefined;

      if (!code || !state) {
        res.status(400).send(renderResult(false, 'Missing code or state on callback.'));
        return;
      }

      const pending = await findPendingByState(state);
      if (pending) pendingConnectionId = pending.connectionId;
      if (!pending || pending.vendor !== 'tuya') {
        res
          .status(400)
          .send(
            renderResult(
              false,
              'This link has expired or was already used. Start over from your agent.',
            ),
          );
        return;
      }

      const cfg = tuyaCfgOrNull();
      if (!cfg) {
        res.status(503).send(renderResult(false, 'Tuya is not configured on this server.'));
        return;
      }

      const tokens = await exchangeTuyaCode(cfg, code);
      await activateConnection(pending.connectionId, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresInSec: tokens.expireTimeSec,
        vendorUserId: tokens.uid,
      });
      logger.info(
        { connection_id: pending.connectionId, agent_id: pending.agentId },
        'device connect: tuya connection activated',
      );
      res
        .status(200)
        .send(renderResult(true, 'Your Tuya account is now linked. You can close this window.'));
    } catch (err) {
      logger.error(
        { err, connection_id: pendingConnectionId },
        'device connect: tuya code exchange failed',
      );
      res
        .status(502)
        .send(renderResult(false, 'Could not complete the link with Tuya. Please try again.'));
    }
  },
);

function renderResult(ok: boolean, message: string): string {
  // Plain, dependency-free HTML -- this is a one-shot result page, not a
  // themed site page (LAW: static pages under redesign are off-limits this
  // phase; this route is new and outside that scope, so it deliberately
  // stays minimal rather than borrowing the site theme without review).
  const color = ok ? '#1a7f37' : '#b42318';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Device connect</title></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:${color}">
<p>${escapeHtml(message)}</p></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/** GET /connect/device/connections -- the agent's own active connections. */
deviceConnectRouter.get(
  '/connect/device/connections',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agentId = req.agent?.agent_id;
      if (!agentId) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const connections = await listActiveConnections(agentId);
      res.json({
        connections: connections.map((c) => ({
          connection_id: c.connection_id,
          vendor: c.vendor,
          status: c.status,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /connect/device/:connectionId/revoke -- agent-authenticated,
 * ownership-checked in the service layer (not trusted from the URL param).
 * Wipes the stored ciphertext, does not merely flip a status flag.
 */
deviceConnectRouter.post(
  '/connect/device/:connectionId/revoke',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agentId = req.agent?.agent_id;
      if (!agentId) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const revoked = await revokeConnection(agentId, String(req.params.connectionId));
      if (!revoked) {
        res.status(404).json({
          error: 'not_found',
          message: 'No active connection with that id for this agent',
        });
        return;
      }
      logger.info(
        { agent_id: agentId, connection_id: String(req.params.connectionId) },
        'device connect: connection revoked',
      );
      res.json({ revoked: true });
    } catch (err) {
      next(err);
    }
  },
);
