import { type Stage, ok, err, type PipelineError } from '../types';

/**
 * CONTENT_NEG stage (§12.43 stage 3, §12.112).
 * JSON-only: reject if Accept header excludes application/json.
 */
export const contentNegotiationStage: Stage = {
  name: 'CONTENT_NEG',

  async execute(ctx) {
    const accept = ctx.headers['accept'];
    const acceptValue = Array.isArray(accept) ? accept[0] : accept;

    if (
      acceptValue &&
      !acceptValue.includes('application/json') &&
      !acceptValue.includes('text/event-stream') &&
      !acceptValue.includes('*/*') &&
      acceptValue !== '*'
    ) {
      return err<PipelineError>({
        code: 406,
        error: 'not_acceptable',
        message: 'Accept header must be application/json',
      });
    }

    return ok(ctx);
  },
};
