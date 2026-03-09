/**
 * MCP server factory and Express route handlers (§12.42, §6.14, §12.1).
 *
 * SSE transport only (Phase 1 — no WebSocket per §12.42, §16).
 * One McpServer + SSEServerTransport per SSE connection (SDK 1:1 design).
 * All tool calls route through the full 13-stage pipeline.
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { logger } from '../config/logger';
import { registerTools } from './tool-adapter';

/** Active SSE sessions: sessionId → transport */
const sessions = new Map<string, SSEServerTransport>();

/**
 * Create Express router for MCP endpoint.
 *
 * GET  /mcp              — SSE stream (sends endpoint event with sessionId)
 * POST /mcp?sessionId=x  — JSON-RPC messages routed to the correct transport
 */
export function createMcpRouter(): express.Router {
  const router = express.Router();

  // -------------------------------------------------------------------------
  // GET /mcp — SSE stream
  // -------------------------------------------------------------------------
  router.get('/mcp', (req: express.Request, res: express.Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Missing or invalid Authorization header. Expected: Bearer <api_key>',
      });
      return;
    }

    const apiKey = authHeader.slice(7);
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();

    const transport = new SSEServerTransport('/mcp', res);
    const sessionId = transport.sessionId;

    const mcpServer = new McpServer(
      { name: 'APIbase', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    registerTools(mcpServer, apiKey, requestId);

    sessions.set(sessionId, transport);
    logger.info({ request_id: requestId, session_id: sessionId }, 'MCP SSE session created');

    // Cleanup on connection close
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

  // -------------------------------------------------------------------------
  // POST /mcp — JSON-RPC messages
  // -------------------------------------------------------------------------
  router.post('/mcp', (req: express.Request, res: express.Response) => {
    const sessionId = req.query.sessionId as string | undefined;
    if (!sessionId) {
      res.status(400).json({
        error: 'bad_request',
        message: 'Missing sessionId query parameter',
      });
      return;
    }

    const transport = sessions.get(sessionId);
    if (!transport) {
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
