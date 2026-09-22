/**
 * MCP server factory and Express route handlers (§12.42, §6.14, §12.1).
 *
 * Dual transport:
 *   - Streamable HTTP (primary, protocol 2025-11-25) — /mcp
 *   - SSE (deprecated, backward compat, protocol 2024-11-05) — /sse + /messages
 *
 * One McpServer + Transport per session. All tool calls route through the
 * full 13-stage pipeline.
 *
 * Session management:
 *   - Max 10,000 concurrent sessions
 *   - 10-minute idle timeout with 60s sweep
 *   - Prometheus gauge: mcp_sessions_active
 */

import express from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { X_REQUEST_ID, X_PAYMENT } from '../config/http-headers';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../config/logger';
import { mcpSessionsActive } from '../services/metrics.service';
import { registerTools, type PaymentContext } from './tool-adapter';
import { registerPrompts } from './prompt-adapter';

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

/** Active sessions: sessionId → transport (both transport types) */
const sessions = new Map<string, SSEServerTransport | StreamableHTTPServerTransport>();

/** Per-session payment context ref — updated on each HTTP request, read by tool callbacks */
const sessionPaymentCtx = new Map<string, PaymentContext>();

/** Last activity timestamp per session for idle eviction */
const sessionLastActivity = new Map<string, number>();

const MAX_SESSIONS = 10_000;
const SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Idle sweep (60s interval)
// ---------------------------------------------------------------------------

function touchSession(sessionId: string): void {
  sessionLastActivity.set(sessionId, Date.now());
}

function removeSession(sessionId: string): void {
  sessions.delete(sessionId);
  sessionLastActivity.delete(sessionId);
  sessionPaymentCtx.delete(sessionId);
  mcpSessionsActive.set(sessions.size);
}

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [sid, lastActive] of sessionLastActivity) {
    if (now - lastActive > SESSION_IDLE_TIMEOUT_MS) {
      const transport = sessions.get(sid);
      if (transport) {
        transport.close?.().catch(() => {});
      }
      removeSession(sid);
      logger.info({ session_id: sid }, 'MCP session evicted (idle timeout)');
    }
  }
}, 60_000);
sweepTimer.unref();

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

/**
 * Close all MCP sessions and stop the sweep timer.
 * Called during graceful shutdown (§12.230).
 */
export async function shutdownMcpSessions(): Promise<void> {
  clearInterval(sweepTimer);
  for (const [sid, transport] of sessions) {
    try {
      await transport.close?.();
    } catch {
      // best-effort
    }
    logger.info({ session_id: sid }, 'MCP session closed (shutdown)');
  }
  sessions.clear();
  sessionLastActivity.clear();
  mcpSessionsActive.set(0);
}

// ---------------------------------------------------------------------------
// Server config
// ---------------------------------------------------------------------------

/**
 * Package version, read at runtime rather than hardcoded (T-ZZ-03-04): `package.json`
 * is the single source of truth so `serverInfo.version` can't drift from the shipped
 * build the way the old literal '1.0.0' did.
 *
 * Read via fs, not `import`/`require('../../package.json')`: that path sits outside
 * tsconfig's `rootDir: "./src"`, which `tsc` rejects (TS6059). readFileSync + JSON.parse
 * resolves relative to __dirname, which keeps the same depth under both `dist/mcp/` (built)
 * and `src/mcp/` (tsx dev), so `../../package.json` lands on the repo root either way.
 */
const { version: PACKAGE_VERSION } = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf8'),
) as { version: string };

/**
 * Server metadata passed to McpServer constructor.
 *
 * `description` intentionally carries no tool/provider counts (T-ZZ-03-04): a hardcoded
 * count goes stale the moment onboarding adds another provider, and this string is echoed
 * verbatim into every MCP client's `initialize` response — including registry crawlers like
 * Glama, which had been showing a frozen "618/191" widget long after the live catalog moved on.
 * Live counts belong at https://apibase.pro/llms.txt, not here.
 */
const SERVER_INFO = {
  name: 'APIbase',
  version: PACKAGE_VERSION,
  title: 'APIbase — The API Hub for AI Agents',
  description:
    'Unified MCP gateway to hundreds of API providers. Pay-per-call via on-chain USDC micropayments (Base and Tempo networks) — self-hosted settlement, no third-party facilitator. Compatible side-by-side with Base MCP — pay APIbase calls directly from your Base Account in Claude, ChatGPT, or Cursor.',
  websiteUrl: 'https://apibase.pro',
  icons: [
    {
      src: 'https://apibase.pro/icon.png',
      mimeType: 'image/png',
      sizes: ['256x256'],
    },
  ],
};

/**
 * Server options with capabilities and instructions.
 *
 * ZZ-03-05 (zz-03 Q1 ruling-1, "SERVER_OPTIONS.instructions переписать: первая инструкция —
 * вызвать apibase.discover"): `tools/list` alone returns every active tool's full definition
 * in one shot — with the catalog at hundreds of tools, that is the "load everything into
 * context" outcome discovery exists to avoid. apibase.discover (free, ranked, filterable) is
 * now the first thing an agent is told to reach for; tools/list is the fallback for a caller
 * that already knows its tool_id.
 */
const SERVER_OPTIONS = {
  capabilities: { tools: {}, prompts: {} },
  instructions:
    'APIbase is an MCP gateway for AI agents. Authenticate with Bearer <api_key> header. ' +
    'Start by calling the apibase.discover tool with your intent (or category/max_price_usd) ' +
    'to find relevant tools — it is free and returns pricing, payment rails, live ' +
    'availability, and quality for each match. Use tools/list only once you already know ' +
    'which tool_id you need. All tools are pay-per-call via x402 micropayments (USDC). ' +
    'Use prompts/list for workflow templates.',
} as const;

/**
 * Create a fully configured McpServer instance with all tools and prompts registered.
 * Payment context ref is a mutable object updated per-request in the POST handler,
 * so tool callbacks always see the payment state from the current HTTP request.
 */
function createMcpServer(
  apiKey: string,
  requestId: string,
  paymentCtxRef: PaymentContext,
): McpServer {
  const mcpServer = new McpServer(SERVER_INFO, SERVER_OPTIONS);
  registerTools(mcpServer, apiKey, requestId, paymentCtxRef);
  registerPrompts(mcpServer);
  return mcpServer;
}

/**
 * Extract payment state from an Express request (populated by x402/MPP middleware).
 */
function extractPaymentFromReq(req: express.Request): PaymentContext {
  const x402 = (req as unknown as Record<string, unknown>).x402Payment as
    | { verified?: boolean; payer?: string }
    | undefined;
  const mpp = (req as unknown as Record<string, unknown>).mppPayment as
    | { verified?: boolean; payer?: string; method?: string; txHash?: string }
    | undefined;
  return {
    x402Paid: !!x402?.verified,
    x402Payer: x402?.payer ?? null,
    x402PaymentHeader: (req.headers[X_PAYMENT] as string) ?? null,
    mppPaid: !!mpp?.verified,
    mppPayer: mpp?.payer ?? null,
    mppMethod: mpp?.method ?? null,
    mppPaymentHeader: (req.headers['authorization'] as string) ?? null,
    mppTxHash: mpp?.txHash ?? null,
  };
}

/**
 * Extract Bearer API key from Authorization header.
 */
function extractApiKey(req: express.Request): string | null {
  // Standard: Authorization: Bearer <key>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Smithery gateway forwards key as apiKey header
  const smitheryKey = req.headers['apikey'] as string | undefined;
  if (smitheryKey) {
    return smitheryKey;
  }
  // Smithery scanner passes key as query parameter (CWE-598: query strings may be logged)
  // Required for Smithery compatibility — prefer header auth when possible
  const queryKey = req.query.apiKey as string | undefined; // nosemgrep: sensitive-data-in-get
  if (queryKey) {
    logger.warn(
      { path: req.path },
      'API key received via query parameter — prefer Authorization header',
    );
    return queryKey;
  }
  return null;
}

/**
 * Create Express router for MCP endpoints.
 *
 * Streamable HTTP (primary):
 *   POST   /mcp — JSON-RPC messages (initialize creates session)
 *   GET    /mcp — SSE subscription for server-initiated notifications
 *   DELETE /mcp — close session
 *
 * SSE (deprecated, backward compat):
 *   GET  /sse      — SSE stream
 *   POST /messages — JSON-RPC messages
 */
export function createMcpRouter(): express.Router {
  const router = express.Router();

  // =========================================================================
  // Streamable HTTP transport — /mcp (primary, protocol 2025-11-25)
  // =========================================================================

  // --- POST /mcp: JSON-RPC messages ---
  router.post('/mcp', async (req: express.Request, res: express.Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Existing session: route to stored transport
      if (sessionId) {
        const transport = sessions.get(sessionId);
        if (!transport || !(transport instanceof StreamableHTTPServerTransport)) {
          res.status(404).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Session not found' },
            id: null,
          });
          return;
        }
        touchSession(sessionId);
        // Update payment context from current HTTP request headers (per-call)
        const payCtx = sessionPaymentCtx.get(sessionId);
        if (payCtx) {
          const fresh = extractPaymentFromReq(req);
          Object.assign(payCtx, fresh);
        }
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // New session: must be an initialize request
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Bad Request: first request must be an initialize request',
          },
          id: null,
        });
        return;
      }

      // Session cap check
      if (sessions.size >= MAX_SESSIONS) {
        res.status(503).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Too many active sessions' },
          id: null,
        });
        return;
      }

      // No hard-401 here: an absent/invalid key is not actually checked against
      // anything at this point — it is only captured to be replayed as an
      // `authorization` header on each tool call (tool-adapter.ts), where the
      // pipeline's AUTH stage validates it and returns a normal JSON-RPC tool
      // error for a bad key (see e.g. "Invalid API key format"). Rejecting the
      // handshake itself here breaks unauthenticated discovery (tools/list,
      // prompts/list, apibase.discover), which this server's own `instructions`
      // field advertises as free — and it makes mcp-proxy (used by Glama's
      // health check, among others) fail before it ever opens its listening
      // port, since mcp-proxy performs this same initialize handshake against
      // the spawned server before serving any client.
      const apiKey = extractApiKey(req) ?? '';

      const requestId = (req.headers[X_REQUEST_ID] as string) || randomUUID();

      // Create mutable payment context ref — updated per-request, read by tool callbacks
      const paymentCtxRef: PaymentContext = extractPaymentFromReq(req);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          sessions.set(sid, transport);
          sessionPaymentCtx.set(sid, paymentCtxRef);
          touchSession(sid);
          mcpSessionsActive.set(sessions.size);
          logger.info(
            { request_id: requestId, session_id: sid },
            'MCP Streamable HTTP session created',
          );
        },
        onsessionclosed: (sid: string) => {
          removeSession(sid);
          logger.info(
            { request_id: requestId, session_id: sid },
            'MCP Streamable HTTP session closed',
          );
        },
      });

      transport.onerror = (error: Error) => {
        logger.error({ request_id: requestId, err: error }, 'MCP Streamable HTTP transport error');
      };

      const mcpServer = createMcpServer(apiKey, requestId, paymentCtxRef);
      await mcpServer.connect(transport);

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error({ err: error }, 'MCP Streamable HTTP POST error');
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_error', message: 'MCP request handling failed' });
      }
    }
  });

  // --- GET /mcp: SSE subscription for server-initiated notifications ---
  router.get('/mcp', async (req: express.Request, res: express.Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId) {
        res.status(400).json({
          error: 'bad_request',
          message: 'Missing mcp-session-id header',
        });
        return;
      }

      const transport = sessions.get(sessionId);
      if (!transport || !(transport instanceof StreamableHTTPServerTransport)) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Session not found' },
          id: null,
        });
        return;
      }

      touchSession(sessionId);
      await transport.handleRequest(req, res);
    } catch (error) {
      logger.error({ err: error }, 'MCP Streamable HTTP GET error');
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_error', message: 'MCP SSE subscription failed' });
      }
    }
  });

  // --- DELETE /mcp: close session ---
  router.delete('/mcp', async (req: express.Request, res: express.Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId) {
        res.status(400).json({
          error: 'bad_request',
          message: 'Missing mcp-session-id header',
        });
        return;
      }

      const transport = sessions.get(sessionId);
      if (!transport || !(transport instanceof StreamableHTTPServerTransport)) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Session not found' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res);
      removeSession(sessionId);
    } catch (error) {
      logger.error({ err: error }, 'MCP Streamable HTTP DELETE error');
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_error', message: 'MCP session close failed' });
      }
    }
  });

  // =========================================================================
  // SSE transport — /sse + /messages (deprecated, backward compat)
  // =========================================================================

  // --- GET /sse: establish SSE stream ---
  router.get('/sse', (req: express.Request, res: express.Response) => {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Missing or invalid Authorization header. Expected: Bearer <api_key>',
      });
      return;
    }

    // Session cap check
    if (sessions.size >= MAX_SESSIONS) {
      res.status(503).json({
        error: 'service_unavailable',
        message: 'Too many active sessions',
      });
      return;
    }

    const requestId = (req.headers[X_REQUEST_ID] as string) || randomUUID();

    const transport = new SSEServerTransport('/messages', res);
    const sessionId = transport.sessionId;

    // Create mutable payment context for SSE session
    const paymentCtxRef: PaymentContext = extractPaymentFromReq(req);
    const mcpServer = createMcpServer(apiKey, requestId, paymentCtxRef);

    sessions.set(sessionId, transport);
    sessionPaymentCtx.set(sessionId, paymentCtxRef);
    touchSession(sessionId);
    mcpSessionsActive.set(sessions.size);
    logger.info({ request_id: requestId, session_id: sessionId }, 'MCP SSE session created');

    const cleanup = (): void => {
      removeSession(sessionId);
      logger.info({ request_id: requestId, session_id: sessionId }, 'MCP SSE session closed');
    };

    res.on('close', cleanup);
    transport.onclose = cleanup;
    transport.onerror = (error: Error): void => {
      logger.error(
        { request_id: requestId, session_id: sessionId, err: error },
        'MCP SSE transport error',
      );
      removeSession(sessionId);
    };

    mcpServer.connect(transport).catch((error: unknown) => {
      logger.error(
        { request_id: requestId, session_id: sessionId, err: error },
        'MCP server connect failed',
      );
      removeSession(sessionId);
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_error', message: 'MCP connection failed' });
      }
    });
  });

  // --- POST /messages: JSON-RPC messages for SSE transport ---
  router.post('/messages', (req: express.Request, res: express.Response) => {
    const sessionId = req.query.sessionId as string | undefined;
    if (!sessionId) {
      res.status(400).json({
        error: 'bad_request',
        message: 'Missing sessionId query parameter',
      });
      return;
    }

    const transport = sessions.get(sessionId);
    if (!transport || !(transport instanceof SSEServerTransport)) {
      res.status(400).json({
        error: 'bad_request',
        message: 'Unknown or expired sessionId',
      });
      return;
    }

    touchSession(sessionId);

    // Update payment context from current HTTP request (per-call for SSE)
    const payCtx = sessionPaymentCtx.get(sessionId);
    if (payCtx) {
      const fresh = extractPaymentFromReq(req);
      Object.assign(payCtx, fresh);
    }

    transport.handlePostMessage(req, res, req.body).catch((error: unknown) => {
      logger.error({ session_id: sessionId, err: error }, 'MCP POST message handling failed');
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_error', message: 'MCP message handling failed' });
      }
    });
  });

  return router;
}
