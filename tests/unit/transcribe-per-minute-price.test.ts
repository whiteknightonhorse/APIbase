jest.mock('../../src/services/redis.service', () => ({}));
import {
  audioMinutePriceUsd,
  resolveToolPriceUsd,
  schemaFailureStatus,
  RATE_MICRO_USD_PER_MINUTE,
  UPSTREAM_USD_PER_MINUTE_MAX,
} from '../../src/pricing/audio-minute';
import { toolSchemas } from '../../src/schemas';
import { AssemblyAIAdapter } from '../../src/adapters/assemblyai';

describe('T-0425 transcribe.submit per-audio-minute price', () => {
  it.each([
    [60, 0.01],
    [120, 0.01],
    [600, 0.05],
    [1800, 0.15],
    [3660, 0.31],
    [14400, 1.2],
  ])('%d s -> $%f', (sec, price) => {
    expect(audioMinutePriceUsd(sec)).toBe(price);
    expect(resolveToolPriceUsd('transcribe.submit', 0.01, { duration_seconds: sec })).toBe(price);
  });

  it('missing / oversized / non-integer duration is not billable and fails the schema with 422', () => {
    for (const bad of [undefined, 0, -5, 14401, 1.5, '600']) {
      expect(audioMinutePriceUsd(bad)).toBeUndefined();
      const r = toolSchemas['transcribe.submit'].safeParse({
        audio_url: 'https://example.com/a.mp3',
        duration_seconds: bad,
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(
          schemaFailureStatus(
            'transcribe.submit',
            r.error.issues.map((i) => i.path.join('.')),
          ),
        ).toBe(422);
      }
    }
  });

  it('other tools stay flat and keep 400', () => {
    expect(resolveToolPriceUsd('transcribe.status', 0.003, { duration_seconds: 6000 })).toBe(0.003);
    expect(schemaFailureStatus('transcribe.submit', ['audio_url'])).toBe(400);
  });

  it('never below 1.3x the upstream upper bound, at every whole-minute length', () => {
    expect(RATE_MICRO_USD_PER_MINUTE / 1e6).toBeGreaterThanOrEqual(
      UPSTREAM_USD_PER_MINUTE_MAX * 1.3,
    );
    for (let m = 1; m <= 240; m++) {
      expect(audioMinutePriceUsd(m * 60)!).toBeGreaterThanOrEqual(
        m * UPSTREAM_USD_PER_MINUTE_MAX * 1.3 - 1e-9,
      );
    }
  });

  it('adapter cuts the upstream job at the declared duration', () => {
    const a = new AssemblyAIAdapter('k');
    const r = a.buildRequest({
      toolId: 'transcribe.submit',
      params: { audio_url: 'https://example.com/a.mp3', duration_seconds: 90 },
    } as never);
    expect(JSON.parse(r.body!).audio_end_at).toBe(90000);
  });
});
