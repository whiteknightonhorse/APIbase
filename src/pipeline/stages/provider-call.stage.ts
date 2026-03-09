import { type Stage, ok } from '../types';

/**
 * PROVIDER_CALL stage (§12.43 stage 9).
 * Call external provider API, normalize response.
 * Stub: full implementation with adapters + normalizers.
 */
export const providerCallStage: Stage = {
  name: 'PROVIDER_CALL',

  async execute(ctx) {
    // TODO: call provider via adapter, normalize response
    ctx.providerCalled = true;
    ctx.providerDurationMs = 0;
    return ok(ctx);
  },
};
