/**
 * T-0893 (TG-INBOX-1117 ruling-1): all telegram tools use the one platform bot token, so no
 * telegram tool may return data about chats the caller has not named.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/services/redis.service', () => ({ getRedis: jest.fn() }));

import { TelegramAdapter } from '../../src/adapters/telegram';
import { telegramSchemas } from '../../src/schemas/telegram.schema';
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';

describe('telegram: shared bot inbox is not exposed', () => {
  it('a: buildRequest rejects telegram.get_updates', () => {
    expect(() =>
      new TelegramAdapter('x').buildRequest({
        toolId: 'telegram.get_updates',
        params: {},
      } as never),
    ).toThrow('Unknown tool: telegram.get_updates');
  });

  it('b: telegramSchemas has no get_updates key', () => {
    expect(Object.keys(telegramSchemas)).not.toContain('telegram.get_updates');
  });

  it('c: telegram tool list is exactly the four sending/info tools', () => {
    // A new telegram tool on the shared bot needs a ruling.
    const ids = TOOL_DEFINITIONS.map((t) => t.toolId)
      .filter((id) => id.startsWith('telegram.'))
      .sort();
    expect(ids).toEqual([
      'telegram.get_chat',
      'telegram.send_document',
      'telegram.send_message',
      'telegram.send_photo',
    ]);
  });

  it('d: get_chat response has no invite_link', () => {
    const raw = {
      status: 200,
      headers: {},
      body: {
        ok: true,
        result: { id: 1, type: 'supergroup', title: 'T', invite_link: 'https://t.me/+secret' },
      },
    };
    const out = new TelegramAdapter('x').parseResponse(
      raw as never,
      {
        toolId: 'telegram.get_chat',
        params: {},
      } as never,
    );
    expect(out.body as Record<string, unknown>).not.toHaveProperty('invite_link');
  });

  it('e: adapter source does not mention getUpdates', () => {
    const src = readFileSync(join(__dirname, '../../src/adapters/telegram/index.ts'), 'utf8');
    expect(src).not.toContain('getUpdates');
  });
});
