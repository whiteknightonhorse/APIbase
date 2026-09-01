/**
 * ШАГ 2 (2026-09-02): filing an appeal pushes content_expires_at out past
 * the 14-day never-appealed deadline, instead of leaving the original
 * creation-time value in place (which would let the cleanup job wipe the
 * content out from under an appeal that IS being actively reviewed).
 */

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({
    moderationAppeal: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  }),
}));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn(),
}));
jest.mock('../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { submitAppeal } from '../../src/services/appeal.service';

const APPEAL_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const CREATED_AT = new Date('2026-09-02T00:00:00Z');
const ORIGINAL_EXPIRY = new Date(CREATED_AT.getTime() + 14 * 24 * 60 * 60 * 1000); // creation + 14d
const OPEN_ROW = {
  appeal_id: APPEAL_ID,
  tool_id: 'telegram.send_message',
  rule_id: 'terrorism-1',
  category: 'terrorism',
  status: 'OPEN',
  created_at: CREATED_AT,
  response_due_at: new Date('2026-09-05T00:00:00Z'),
  resolved_at: null,
  resolution_note: null,
  contact_email: null,
  message: null,
  matched_field: 'text',
  matched_content: 'join isis recruitment',
  content_truncated: false,
  match_start: 5,
  match_end: 27,
  content_expires_at: ORIGINAL_EXPIRY,
};

beforeEach(() => {
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
});

describe('submitAppeal — content_expires_at extension (ШАГ 2)', () => {
  it('pushes content_expires_at well past the original 14-day deadline once an appeal is actually filed', async () => {
    mockFindUnique.mockResolvedValue(OPEN_ROW);
    mockUpdate.mockImplementation(({ data }) => Promise.resolve({ ...OPEN_ROW, ...data }));

    const result = await submitAppeal(APPEAL_ID, { message: 'this was a false positive' });

    expect(result.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const data = mockUpdate.mock.calls[0][0].data;
    expect(data.content_expires_at).toBeInstanceOf(Date);
    // Must be pushed meaningfully past the original 14-day value -- the
    // whole point is that filing an appeal keeps the content alive while
    // it's under review, not let it expire out from under the reviewer.
    expect((data.content_expires_at as Date).getTime()).toBeGreaterThan(
      ORIGINAL_EXPIRY.getTime() + 300 * 24 * 60 * 60 * 1000,
    );
  });

  it('does NOT touch content_expires_at when the appeal is already resolved (no-op path)', async () => {
    mockFindUnique.mockResolvedValue({ ...OPEN_ROW, status: 'UPHELD' });
    const result = await submitAppeal(APPEAL_ID, { message: 'too late' });
    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
