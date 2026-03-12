#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

const MCP_URL = process.env.APIBASE_MCP_URL || 'https://apibase.pro/mcp';
const apiKey = process.argv[2] || process.env.APIBASE_API_KEY;

const headers: Record<string, string> = {};
if (apiKey) {
  headers['Authorization'] = `Bearer ${apiKey}`;
}

const stdio = new StdioServerTransport();
const http = new StreamableHTTPClientTransport(new URL(MCP_URL), {
  requestInit: { headers },
});

// Bidirectional proxy: stdio ↔ HTTP
stdio.onmessage = (msg: JSONRPCMessage) => {
  http.send(msg).catch((e) => process.stderr.write(`[apibase-mcp] send error: ${e}\n`));
};

http.onmessage = (msg: JSONRPCMessage) => {
  stdio.send(msg).catch((e) => process.stderr.write(`[apibase-mcp] recv error: ${e}\n`));
};

// Error propagation
stdio.onerror = (e: Error) => process.stderr.write(`[apibase-mcp] stdio: ${e.message}\n`);
http.onerror = (e: Error) => process.stderr.write(`[apibase-mcp] http: ${e.message}\n`);

// Graceful shutdown
let closing = false;
const shutdown = (): void => {
  if (closing) return;
  closing = true;
  Promise.allSettled([http.close(), stdio.close()]).then(() => process.exit(0));
};

stdio.onclose = shutdown;
http.onclose = shutdown;
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start both transports
await stdio.start();
await http.start();
