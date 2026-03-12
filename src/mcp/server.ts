/**
 * MCP server factory and Express route handlers (§12.42, §6.14, §12.1).
 *
 * Dual transport:
 *   - Streamable HTTP (primary, protocol 2025-11-25) — /mcp
 *   - SSE (deprecated, backward compat, protocol 2024-11-05) — /sse + /messages
 *
 * One McpServer + Transport per session. All tool calls route through the
 * full 13-stage pipeline.
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../config/logger';
import { registerTools } from './tool-adapter';
import { registerPrompts } from './prompt-adapter';

/** Active sessions: sessionId → transport (both transport types) */
const sessions = new Map<string, SSEServerTransport | StreamableHTTPServerTransport>();

/** Server metadata passed to McpServer constructor */
const SERVER_INFO = {
  name: 'APIbase',
  version: '1.0.0',
  title: 'APIbase — The API Hub for AI Agents',
  description:
    'Unified MCP gateway to 56+ tools: flights (Amadeus, Sabre), prediction markets (Polymarket), weather, and more. New providers added regularly. Pay-per-call via x402 micropayments.',
  websiteUrl: 'https://apibase.pro',
  icons: [
    {
      src: 'https://apibase.pro/icon.png',
      mimeType: 'image/png',
      sizes: ['256x256'],
    },
  ],
};

/** Server options with capabilities and instructions */
const SERVER_OPTIONS = {
  capabilities: { tools: {}, prompts: {} },
  instructions:
    'APIbase is an MCP gateway for AI agents. Authenticate with Bearer <api_key> header. ' +
    'All tools are pay-per-call via x402 micropayments (USDC). ' +
    'Use tools/list to discover available tools. Use prompts/list for workflow templates.',
} as const;

/**
 * Create a fully configured McpServer instance with all tools and prompts registered.
 */
function createMcpServer(apiKey: string, requestId: string): McpServer {
  const mcpServer = new McpServer(SERVER_INFO, SERVER_OPTIONS);
  registerTools(mcpServer, apiKey, requestId);
  registerPrompts(mcpServer);
  return mcpServer;
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

      const apiKey = extractApiKey(req);
      if (!apiKey) {
        res.status(401).json({
          error: 'unauthorized',
          message: 'Missing or invalid Authorization header. Expected: Bearer <api_key>',
        });
        return;
      }

      const requestId = (req.headers['x-request-id'] as string) || randomUUID();

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          sessions.set(sid, transport);
          logger.info(
            { request_id: requestId, session_id: sid },
            'MCP Streamable HTTP session created',
          );
        },
        onsessionclosed: (sid: string) => {
          sessions.delete(sid);
          logger.info(
            { request_id: requestId, session_id: sid },
            'MCP Streamable HTTP session closed',
          );
        },
      });

      transport.onerror = (error: Error) => {
        logger.error(
          { request_id: requestId, err: error },
          'MCP Streamable HTTP transport error',
        );
      };

      const mcpServer = createMcpServer(apiKey, requestId);
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
      sessions.delete(sessionId);
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

    const requestId = (req.headers['x-request-id'] as string) || randomUUID();

    const transport = new SSEServerTransport('/messages', res);
    const sessionId = transport.sessionId;

    const mcpServer = createMcpServer(apiKey, requestId);

    sessions.set(sessionId, transport);
    logger.info({ request_id: requestId, session_id: sessionId }, 'MCP SSE session created');

    const cleanup = (): void => {
      sessions.delete(sessionId);
      logger.info({ request_id: requestId, session_id: sessionId }, 'MCP SSE session closed');
    };

    res.on('close', cleanup);
    transport.onclose = cleanup;
    transport.onerror = (error: Error): void => {
      logger.error(
        { request_id: requestId, session_id: sessionId, err: error },
        'MCP SSE transport error',
      );
      sessions.delete(sessionId);
    };

    mcpServer.connect(transport).catch((error: unknown) => {
      logger.error(
        { request_id: requestId, session_id: sessionId, err: error },
        'MCP server connect failed',
      );
      sessions.delete(sessionId);
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

    transport.handlePostMessage(req, res, req.body).catch((error: unknown) => {
      logger.error({ session_id: sessionId, err: error }, 'MCP POST message handling failed');
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_error', message: 'MCP message handling failed' });
      }
    });
  });

  return router;
}
