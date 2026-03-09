import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { registerAgent, autoRegisterAnonymous } from '../services/agent.service';
import { AppError, ErrorCode } from '../types/errors';
import { logger } from '../config/logger';

/**
 * Agent registration routes (§9.3).
 *
 * POST /api/v1/agents/register — explicit registration (KYA Basic)
 * POST /api/v1/agents/auto    — implicit auto-registration (KYA Anonymous)
 */
export const agentsRouter = Router();

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const registerSchema = z
  .object({
    agent_name: z.string().min(1).max(128),
    agent_version: z.string().min(1).max(64),
    public_key: z.string().max(512).optional(),
  })
  .strip();

// ---------------------------------------------------------------------------
// POST /api/v1/agents/register — Explicit registration (§9.3)
// ---------------------------------------------------------------------------

agentsRouter.post(
  '/api/v1/agents/register',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = registerSchema.safeParse(req.body);

      if (!parsed.success) {
        const issues = parsed.error.issues.slice(0, 10).map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }));

        throw new AppError(
          ErrorCode.BAD_REQUEST,
          `Invalid registration body: ${issues.map((i) => i.message).join(', ')}`,
        );
      }

      const result = await registerAgent({
        agentName: parsed.data.agent_name,
        agentVersion: parsed.data.agent_version,
        publicKey: parsed.data.public_key,
      });

      logger.info(
        { agentId: result.agent_id, requestId: req.requestId },
        'Agent registration successful',
      );

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/agents/auto — Implicit auto-registration (§9.3, §12.84)
// ---------------------------------------------------------------------------

agentsRouter.post(
  '/api/v1/agents/auto',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      const userAgent =
        (req.headers['x-agent-name'] as string) ?? req.headers['user-agent'] ?? 'unknown';

      const result = await autoRegisterAnonymous(ip, userAgent);

      if (!result.api_key) {
        // Existing anonymous agent — return agent_id only
        res.status(200).json({
          agent_id: result.agent_id,
          tier: result.tier,
          message: 'Anonymous agent already exists for this fingerprint',
        });
        return;
      }

      res.status(201).json({
        agent_id: result.agent_id,
        api_key: result.api_key,
        tier: result.tier,
      });
    } catch (err) {
      next(err);
    }
  },
);
