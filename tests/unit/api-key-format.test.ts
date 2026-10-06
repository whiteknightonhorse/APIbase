import {
  generateApiKey,
  generateTestApiKey,
  isValidApiKeyFormat,
} from '../../src/services/api-key.service';

describe('isValidApiKeyFormat', () => {
  it('AK1 accepts generated keys and rejects malformed strings', () => {
    expect(isValidApiKeyFormat(generateApiKey())).toBe(true);
    expect(isValidApiKeyFormat(generateTestApiKey())).toBe(true);
    expect(isValidApiKeyFormat('ak_live_' + 'a'.repeat(31))).toBe(false);
    expect(isValidApiKeyFormat('sk_live_' + 'a'.repeat(32))).toBe(false);
    expect(isValidApiKeyFormat('ak_live_' + 'z'.repeat(32))).toBe(false);
  });

  it('AK2 non-string values do not throw and return false', () => {
    const values: unknown[] = [
      Array(40).fill('a'),
      [generateApiKey()],
      { length: 40 },
      40,
      null,
      undefined,
      Buffer.from(generateApiKey()),
    ];
    for (const v of values) expect(isValidApiKeyFormat(v)).toBe(false);
  });
});
