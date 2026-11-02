/**
 * T-0603 review R2: validation errors keep their zod 3 wording, codes and issue lists after the
 * zod 4 upgrade (src/utils/zod3-errors.ts).
 *
 * tests/fixtures/zod3-validation-errors.json was captured under zod 3.25.76 at ed21b180 from a
 * 239922-case battery of bad inputs over every tool: `stage` cases are the 400 of the REST
 * pipeline (status, message, SCHEMA_VALIDATION issues, precheck issues), `mcp` cases the SDK's
 * InvalidParams text for tools/call. The fixture keeps up to one case per distinct message/code
 * pattern plus fixed tools (unions, enum order, an empty shape). On the full battery HEAD differs
 * from zod 3 only on integers beyond 2^53-1 (asserted below).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

jest.mock('../../src/config/index', () => ({
  config: {
    ENCRYPTION_KEY: 'k'.repeat(40),
    X402_NETWORK: 'base',
    X402_PAYMENT_ADDRESS: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    X402_FACILITATOR_URL: 'https://facilitator.example',
    X402_FACILITATOR_MODE: 'local',
    X402_OPERATOR_PRIVATE_KEY: '0x00',
    X402_BASE_RPC_URL: 'https://base.example',
    X402_BASE_SEPOLIA_RPC_URL: 'https://sepolia.example',
    X402_OPERATOR_MIN_ETH_BALANCE: 0.01,
  },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/pipeline/pipeline', () => ({ runPipeline: jest.fn() }));

import { createMcpServer } from '../../src/mcp/server';
import { schemaValidationStage } from '../../src/pipeline/stages/schema-validation.stage';
import { bodySchemaFailure } from '../../src/pipeline/precheck';
import type { PipelineContext } from '../../src/pipeline/types';
import { zod3Issues } from '../../src/utils/zod3-errors';

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/zod3-validation-errors.json'), 'utf8'),
) as { cases: Record<string, unknown> };

/** `<kind> <tool> <json input>`; the input JSON has no spaces. */
function parseKey(key: string): { kind: string; tool: string; input: unknown } {
  const [kind, tool, ...rest] = key.split(' ');
  const raw = rest.join(' ');
  return { kind, tool, input: raw === 'undefined' ? undefined : JSON.parse(raw) };
}

async function stageResult(tool: string, body: unknown): Promise<unknown> {
  const r = (await schemaValidationStage.execute({ toolId: tool, body } as PipelineContext)) as {
    ok: boolean;
    error?: { code: number; message: string; extra?: { issues?: unknown } };
  };
  if (r.ok) return 'OK';
  return [
    r.error?.code,
    r.error?.message,
    r.error?.extra?.issues,
    bodySchemaFailure(tool, body)?.issues,
  ];
}

type Validate = (tool: unknown, args: unknown, name: string) => Promise<unknown>;
const server = createMcpServer('ak_test', 'req-1', {} as never) as unknown as {
  _registeredTools: Record<string, unknown>;
  validateToolInput: Validate;
};

async function mcpResult(tool: string, args: unknown): Promise<unknown> {
  try {
    await server.validateToolInput(server._registeredTools[tool], args, tool);
    return 'OK';
  } catch (e) {
    return (e as Error).message;
  }
}

const cases = Object.entries(fixture.cases);

describe('validation errors match zod 3 (fixture captured at ed21b180)', () => {
  it('covers both surfaces', () => {
    expect(cases.filter(([k]) => k.startsWith('stage ')).length).toBeGreaterThan(100);
    expect(cases.filter(([k]) => k.startsWith('mcp ')).length).toBeGreaterThan(100);
  });

  it.each(cases)('%s', async (key, expected) => {
    const { kind, tool, input } = parseKey(key);
    const actual = kind === 'stage' ? await stageResult(tool, input) : await mcpResult(tool, input);
    expect(actual).toEqual(expected);
  });
});

describe('zod3Issues', () => {
  const issuesOf = (schema: z.ZodType, input: unknown) => {
    const r = schema.safeParse(input);
    if (r.success) throw new Error('expected failure');
    return zod3Issues(r.error.issues, schema, input).map((i) => [
      i.path.join('.'),
      i.code,
      i.message,
    ]);
  };

  it('zod 3 wording and codes for the common issues', () => {
    const s = z.object({
      a: z.string(),
      b: z.enum(['x', 'y']),
      c: z.string().email(),
      d: z.string().min(2),
      e: z.literal('k'),
      f: z.string().regex(/^\d+$/),
    });
    expect(issuesOf(s, { b: 'q', c: 'no', d: 'z', e: 'j', f: 'x' })).toEqual([
      ['a', 'invalid_type', 'Required'],
      ['b', 'invalid_enum_value', "Invalid enum value. Expected 'x' | 'y', received 'q'"],
      ['c', 'invalid_string', 'Invalid email'],
      ['d', 'too_small', 'String must contain at least 2 character(s)'],
      ['e', 'invalid_literal', 'Invalid literal value, expected "k"'],
      ['f', 'invalid_string', 'Invalid'],
    ]);
  });

  it('a type failure is not followed by length checks; array length precedes elements', () => {
    const s = z.object({ a: z.array(z.string()).min(2) });
    expect(issuesOf(s, { a: 'x' })).toEqual([
      ['a', 'invalid_type', 'Expected array, received string'],
    ]);
    expect(issuesOf(s, { a: [1] })).toEqual([
      ['a', 'too_small', 'Array must contain at least 2 element(s)'],
      ['a.0', 'invalid_type', 'Expected string, received number'],
    ]);
  });

  it('.int() is a check: a float still gets the bounds declared after it', () => {
    const s = z.object({ n: z.number().int().min(5) });
    expect(issuesOf(s, { n: 1.5 })).toEqual([
      ['n', 'invalid_type', 'Expected integer, received float'],
      ['n', 'too_small', 'Number must be greater than or equal to 5'],
    ]);
  });

  it('a union reports the option that failed on checks only', () => {
    const s = z.object({ id: z.union([z.number().int(), z.string().min(3)]) });
    expect(issuesOf(s, { id: 1.5 })).toEqual([
      ['id', 'invalid_type', 'Expected integer, received float'],
    ]);
  });

  it('schema messages are kept, their zod 4 codes mapped', () => {
    const s = z.object({ d: z.string().regex(/^\d{8}$/, 'Must be YYYYMMDD format') });
    expect(issuesOf(s, { d: 'x' })).toEqual([['d', 'invalid_string', 'Must be YYYYMMDD format']]);
  });

  it('known residual: zod 4 .int() rejects integers beyond 2^53-1 (zod 3 accepted them)', () => {
    expect(issuesOf(z.object({ n: z.number().int() }), { n: 1e300 })).toEqual([
      ['n', 'too_big', 'Number must be less than or equal to 9007199254740991'],
    ]);
    // with a declared bound zod 3 reported only that bound, and so does this
    expect(issuesOf(z.object({ n: z.number().int().max(10) }), { n: 1e300 })).toEqual([
      ['n', 'too_big', 'Number must be less than or equal to 10'],
    ]);
  });
});
