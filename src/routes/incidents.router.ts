import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import {
  listIncidents,
  getIncidentById,
  getEngineHeartbeatStatus,
  VALID_STATES,
  VALID_SEVERITIES,
} from '../services/incidents.service';
import { AppError, ErrorCode } from '../types/errors';

/**
 * Incidents API (AP-9, L1). Read-only, public, no auth — same posture as
 * dashboardRouter: a status page, not a control surface. Writes to
 * `incidents` only ever happen through `incident-cli.py`/`incident-engine.py`
 * (I4's "единственная ручка записи для агентов") — nothing here mutates.
 *
 * GET /api/v1/incidents?state=&severity=&provider= — filtered list (max 100),
 *   plus `engine_heartbeat_at`/`engine_heartbeat_stale` (T-04, 2026-09-04):
 *   the list endpoint doubles as the freshness signal for
 *   static/dashboard.html's SEV banner — "no open incidents" and "the
 *   engine has never measured anything" must never render the same green
 *   "autopilot: OK" (see incidents.service.ts's getEngineHeartbeatStatus).
 * GET /api/v1/incidents/:id — single incident
 *
 * nginx mount (gate: scripts/check-mount-nginx-parity.py): rides the
 * existing prefix `location /api/ { proxy_pass ...; }` in nginx/nginx.conf —
 * no new location block needed. `location = /api` and `location = /api/v1`
 * are EXACT-match blocks (the x402 discovery challenge) that only intercept
 * a literal `/api` or `/api/v1` request; `/api/v1/incidents` is a strictly
 * longer path, so nginx falls through to the `/api/` PREFIX block instead —
 * verified live with the gate script, not assumed (see AP-9 knowledge
 * entry): "declared but not wired" has bitten this project twice already.
 *
 * Rate limiting (Fable ruling-3, non-blocking note): unlike dashboardRouter
 * — which is shielded by a 60s Redis cache, so a hammered dashboard mostly
 * hammers Redis, not Postgres — this router hits Prisma on every single
 * request with no cache in front. Same application-level express-rate-limit
 * pattern as oauth.router.ts, which exists specifically to satisfy CodeQL's
 * `js/missing-rate-limiting` on a public unauthenticated GET.
 */
const incidentsLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store').status(429).json({
      error: 'rate_limited',
      error_description: 'Too many requests — rate limit exceeded',
    });
  },
});

export const incidentsRouter = Router();

incidentsRouter.get(
  '/api/v1/incidents',
  incidentsLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      if (state && !(VALID_STATES as readonly string[]).includes(state)) {
        throw new AppError(
          ErrorCode.BAD_REQUEST,
          `state must be one of: ${VALID_STATES.join(', ')}`,
        );
      }
      const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined;
      if (severity && !(VALID_SEVERITIES as readonly string[]).includes(severity)) {
        throw new AppError(
          ErrorCode.BAD_REQUEST,
          `severity must be one of: ${VALID_SEVERITIES.join(', ')}`,
        );
      }
      const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;

      const [incidents, heartbeat] = await Promise.all([
        listIncidents({ state, severity, provider }),
        getEngineHeartbeatStatus(),
      ]);
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.status(200).json({ incidents, count: incidents.length, ...heartbeat });
    } catch (err) {
      next(err);
    }
  },
);

incidentsRouter.get(
  '/api/v1/incidents/:id',
  incidentsLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const incident = await getIncidentById(id);
      if (!incident) {
        throw new AppError(ErrorCode.NOT_FOUND, `Incident not found: ${id}`);
      }
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.status(200).json(incident);
    } catch (err) {
      next(err);
    }
  },
);
