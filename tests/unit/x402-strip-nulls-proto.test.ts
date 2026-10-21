/**
 * T-0516: stripNulls must keep client-supplied `__proto__` / `constructor` keys as own data
 * properties (never reaching the prototype setter) while still dropping nulls recursively.
 */
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/config/x402.config', () => ({
  toMicroUsdc: String,
  getX402Config: () => ({}),
}));

import { stripNulls } from '../../src/middleware/x402.middleware';

describe('stripNulls property injection (T-0516)', () => {
  it('keeps __proto__ and constructor as own properties, prototype untouched', () => {
    const input = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"constructor":{"x":1,"n":null},"a":null,"b":2}',
    );
    const out = stripNulls(input) as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(out, 'constructor')).toBe(true);
    expect(out.polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(out).sort()).toEqual(['__proto__', 'b', 'constructor']);
    expect(Object.getOwnPropertyDescriptor(out, 'constructor')?.value).toEqual({ x: 1 });
    expect(Object.getOwnPropertyDescriptor(out, '__proto__')?.value).toEqual({ polluted: 'yes' });
  });

  it('drops nulls recursively and maps arrays', () => {
    expect(stripNulls({ a: null, b: [{ c: null, d: 1 }, null], e: { f: null } })).toEqual({
      b: [{ d: 1 }, null],
      e: {},
    });
  });
});
