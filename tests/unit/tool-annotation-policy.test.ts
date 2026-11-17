/**
 * T-0857 (TOOL-ANNOTATIONS-1116 ruling-1): tool safety hints follow one rule.
 *
 * destructiveHint is true when a call can: (a) commit or move money or irreversibly change a money
 * record; (b) delete, revoke, deactivate or invalidate existing data; (c) deliver something to a
 * third party that cannot be recalled (email, SMS, chat message, device command); (d) invoke
 * another tool of classes a-c. destructiveHint false is allowed only when the call creates a new
 * record or sets a value the caller can set back with the same tool, and nothing leaves the
 * platform irrecoverably. readOnlyHint true is allowed only when the call changes nothing a later
 * call can observe (a payment for the call itself is not a tool effect).
 */
import { TOOL_DEFINITIONS } from '../../src/mcp/tool-definitions';
import { shopToolDefinitions } from '../../src/shop/tool-definitions';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

type Hints = Record<string, unknown>;
interface Row {
  name: string;
  description: string;
  hints: Hints;
}

/**
 * Tools whose MCP name carries a risk token but whose behaviour is a pure query. Empty by design:
 * an entry needs a ruling.
 */
export const NAME_TOKEN_EXCEPTIONS: readonly string[] = [];

/**
 * Tools whose description starts with the ACTION marker (a pricing/feature marker, not an effect
 * claim) and that only query or render without changing anything observable. An entry needs a
 * ruling; confirmed by the 0857 q-2 ruling of 2026-11-16; the list is frozen, a new entry needs a ruling.
 */
export const ACTION_READONLY_EXCEPTIONS: readonly string[] = [
  'amadeus.flights.search',
  'aipush.pages.list',
  'web.screenshot.capture',
  'ai.image.generate',
  'web.scrape.extract',
  'web.scrape.browser',
  'web.scrape.screenshot',
];

const RISK_TOKENS = new Set([
  'pay',
  'refund',
  'transfer',
  'withdraw',
  'payout',
  'charge',
  'delete',
  'remove',
  'purge',
  'revoke',
  'cancel',
  'deactivate',
  'send',
  'sms',
  'command',
]);

const EXPECTED: Record<string, Hints> = {
  'shop.order.pay': { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  'shop.subscription.preauthorize': { readOnlyHint: false, destructiveHint: true },
  'shop.subscription.confirm_pull': { readOnlyHint: false, destructiveHint: true },
  'shop.merchant.refund': {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  'shop.merchant.rotate_key': { readOnlyHint: false, destructiveHint: true },
  'email.transactional.send': { readOnlyHint: false, destructiveHint: true },
  'phone.twilio.sms': { readOnlyHint: false, destructiveHint: true },
  'phone.telnyx.sms_na': { readOnlyHint: false, destructiveHint: true },
  'phone.telnyx.sms_world': { readOnlyHint: false, destructiveHint: true },
  'phone.telnyx.sms_premium': { readOnlyHint: false, destructiveHint: true },
  'device.registry.command': { readOnlyHint: false, destructiveHint: true },
  'apibase.tools.call': { readOnlyHint: false, destructiveHint: true },
  'platform.batch.call': { readOnlyHint: false, destructiveHint: true },
  'polymarket.trading.place_order': {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  'audio.transcribe.submit': {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

let rows: Row[];
beforeAll(async () => {
  const main = TOOL_DEFINITIONS.map((t) => ({
    name: t.mcpName ?? t.toolId,
    description: t.description,
    hints: (t.annotations ?? {}) as Hints,
  }));
  const shop = (await shopToolDefinitions()).map((t) => ({
    name: String(t.name),
    description: String(t.description ?? ''),
    hints: (t.annotations ?? {}) as Hints,
  }));
  rows = [...main, ...shop];
});

describe('T-0857 tool annotation policy', () => {
  it.each(Object.keys(EXPECTED))('a. %s declares exactly the ruled hints', (name) => {
    const row = rows.find((r) => r.name === name);
    expect(row).toBeDefined();
    expect(row!.hints).toMatchObject(EXPECTED[name]);
  });

  it('b. no ACTION-marked tool is readOnlyHint true', () => {
    const bad = rows
      .filter((r) => /^\W*ACTION\b/.test(r.description) && r.hints.readOnlyHint === true)
      .map((r) => r.name)
      .filter((n) => !ACTION_READONLY_EXCEPTIONS.includes(n));
    expect(bad).toEqual([]);
  });

  it('c. no tool with a risk token in its name is readOnlyHint true or destructiveHint false', () => {
    const bad = rows
      .filter((r) => r.name.split(/[._]/).some((t) => RISK_TOKENS.has(t)))
      .filter((r) => r.hints.readOnlyHint === true || r.hints.destructiveHint === false)
      .map((r) => r.name)
      .filter((n) => !NAME_TOKEN_EXCEPTIONS.includes(n));
    expect(bad).toEqual([]);
  });

  it('d. every tool carries a boolean readOnlyHint', () => {
    const bad = rows.filter((r) => typeof r.hints.readOnlyHint !== 'boolean').map((r) => r.name);
    expect(bad).toEqual([]);
  });

  it('the exception lists name existing tools only', () => {
    for (const n of [...NAME_TOKEN_EXCEPTIONS, ...ACTION_READONLY_EXCEPTIONS]) {
      expect(rows.some((r) => r.name === n)).toBe(true);
    }
  });
});
