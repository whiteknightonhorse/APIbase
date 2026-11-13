import { TOOL_NAME_ALIASES, resolveMcpToolAlias } from '../../src/mcp/tool-alias-resolver';

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('MCP tools/call alias resolver (T-0182)', () => {
  it('has at least one legacy toolId -> mcpName alias', () => {
    expect(TOOL_NAME_ALIASES.size).toBeGreaterThan(0);
  });

  it('never aliases a name to itself', () => {
    for (const [legacy, current] of TOOL_NAME_ALIASES) {
      expect(current).not.toBe(legacy);
    }
  });

  it('rewrites a legacy toolId to the current mcpName in a tools/call body', () => {
    const [legacyName, currentName] = [...TOOL_NAME_ALIASES.entries()][0];
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: legacyName, arguments: {} },
    };
    resolveMcpToolAlias(body, 'req-1');
    expect(body.params.name).toBe(currentName);
  });

  it('leaves a body already using the current mcpName unchanged', () => {
    const [, currentName] = [...TOOL_NAME_ALIASES.entries()][0];
    const body = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: currentName, arguments: {} },
    };
    resolveMcpToolAlias(body, 'req-2');
    expect(body.params.name).toBe(currentName);
  });

  it('is a no-op for non tools/call methods', () => {
    const body = { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} };
    const before = JSON.stringify(body);
    resolveMcpToolAlias(body, 'req-3');
    expect(JSON.stringify(body)).toBe(before);
  });

  it('handles a batch (array) body, rewriting only the tools/call entries', () => {
    const [legacyName, currentName] = [...TOOL_NAME_ALIASES.entries()][0];
    const body = [
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: legacyName, arguments: {} } },
    ];
    resolveMcpToolAlias(body, 'req-4');
    expect(body[1].params.name).toBe(currentName);
  });

  it('is a no-op for an unknown tool name', () => {
    const body = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'does.not.exist', arguments: {} },
    };
    resolveMcpToolAlias(body, 'req-5');
    expect(body.params.name).toBe('does.not.exist');
  });
});

describe('apibase.call rewrite runs before the alias resolver (T-0838)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { rewriteApibaseCalls } =
    require('../../src/mcp/apibase-call') as typeof import('../../src/mcp/apibase-call');

  it('a legacy toolId given to apibase.call becomes the registered mcpName; the resolver then leaves it', () => {
    const [legacyName, currentName] = [...TOOL_NAME_ALIASES.entries()].find(
      ([id]) => !/^(apibase|platform|shop)\./.test(id),
    )!;
    const body = {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'apibase.call', arguments: { tool_id: legacyName, arguments: {} } },
    };
    rewriteApibaseCalls(body, 'req-9');
    expect(body.params).toEqual({ name: currentName, arguments: {} });
    resolveMcpToolAlias(body, 'req-9');
    expect(body.params.name).toBe(currentName);
  });
});
