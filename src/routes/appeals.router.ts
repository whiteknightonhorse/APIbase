import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../config/logger';
import { X_REQUEST_ID } from '../config/http-headers';
import {
  getAppeal,
  submitAppeal,
  checkAppealSubmitRateLimit,
  isValidAppealId,
} from '../services/appeal.service';

/**
 * Moderation appeal endpoint + page (F2/C-3, §12.43 MODERATION step 4).
 *
 * The appeal record is created automatically when MODERATION blocks a PAID
 * request (moderation.stage.ts) — this router only lets the blocked party
 * see it and add their contact info + message, within the 72h response
 * window. Resolving an appeal (UPHELD/OVERTURNED) is operator-only.
 */

const submitSchema = z
  .object({
    contact_email: z.string().email().max(256).optional(),
    message: z.string().min(1).max(2000).optional(),
  })
  .strip();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPage(view: {
  appeal_id: string;
  tool_id: string;
  category: string;
  status: string;
  created_at: Date;
  response_due_at: Date;
  resolved_at: Date | null;
  resolution_note: string | null;
}): string {
  const dueStr = view.response_due_at.toISOString();
  const isOpen = view.status === 'OPEN';
  const statusBlock = isOpen
    ? `<p class="status open">OPEN — a human will respond by ${escapeHtml(dueStr)}.</p>`
    : `<p class="status resolved">${escapeHtml(view.status)}${
        view.resolution_note ? ` — ${escapeHtml(view.resolution_note)}` : ''
      }</p>`;

  const formBlock = isOpen
    ? `<form method="POST" action="/appeals/${escapeHtml(view.appeal_id)}">
<label>Your Email (optional)</label>
<input name="contact_email" type="email" maxlength="256">
<label>Why should this be reconsidered? <span class="req">*</span></label>
<textarea name="message" required maxlength="2000" placeholder="Explain the context — this goes to a human reviewer."></textarea>
<button type="submit">Submit appeal</button>
</form>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>APIbase.pro — Moderation Appeal</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e0e0e0;display:flex;justify-content:center;padding:2rem}
.card{max-width:520px;width:100%;background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:2rem}
h1{font-size:1.5rem;margin-bottom:.25rem;color:#fff}
p.sub{color:#888;margin-bottom:1rem;font-size:.9rem}
dl{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem;font-size:.85rem;color:#ccc;margin-bottom:1rem}
dt{color:#888}
p.status{padding:.6rem .75rem;border-radius:6px;font-size:.9rem;margin-bottom:1.5rem}
p.status.open{background:#3b2f0a;color:#f5c542}
p.status.resolved{background:#1a2e1a;color:#7ee787}
label{display:block;font-size:.85rem;color:#aaa;margin-bottom:.25rem;margin-top:1rem}
input,textarea{width:100%;padding:.6rem .75rem;background:#111;border:1px solid #333;border-radius:6px;color:#e0e0e0;font-size:.9rem}
textarea{resize:vertical;min-height:100px}
button{margin-top:1.5rem;width:100%;padding:.75rem;background:#3b82f6;color:#fff;border:none;border-radius:6px;font-size:1rem;cursor:pointer}
button:hover{background:#2563eb}
.req{color:#ef4444}
</style>
</head>
<body>
<div class="card">
<h1>Moderation Appeal</h1>
<p class="sub">This request was blocked by content moderation. Payment for it was still charged — you can contest that decision here.</p>
<dl>
<dt>Appeal ID</dt><dd>${escapeHtml(view.appeal_id)}</dd>
<dt>Tool</dt><dd>${escapeHtml(view.tool_id)}</dd>
<dt>Category</dt><dd>${escapeHtml(view.category)}</dd>
<dt>Filed</dt><dd>${escapeHtml(view.created_at.toISOString())}</dd>
</dl>
${statusBlock}
${formBlock}
</div>
</body>
</html>`;
}

export const appealsRouter = Router();

/** 400 for a malformed appeal_id (not a UUID at all) -- distinct from 404
 *  (well-formed id, no such row), same content-negotiation as the 404
 *  branch below. Live bug this fixes: an invalid id used to fall through to
 *  Prisma's UUID cast, which throws uncaught -> 502 at the edge. */
function sendInvalidAppealId(req: Request, res: Response): void {
  res.status(400);
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    res
      .type('html')
      .send('<!DOCTYPE html><title>Invalid appeal id</title><p>Malformed appeal id.</p>');
  } else {
    res.json({ error: 'invalid_id', message: 'appealId must be a UUID' });
  }
}

/** GET /appeals/:appealId — HTML page (or JSON if Accept asks for it). */
appealsRouter.get('/appeals/:appealId', async (req: Request, res: Response) => {
  const appealId = req.params.appealId as string;
  if (!isValidAppealId(appealId)) {
    sendInvalidAppealId(req, res);
    return;
  }

  try {
    const appeal = await getAppeal(appealId);
    if (!appeal) {
      res.status(404);
      const accept = req.headers.accept || '';
      if (accept.includes('text/html')) {
        res.type('html').send('<!DOCTYPE html><title>Not found</title><p>No such appeal.</p>');
      } else {
        res.json({ error: 'not_found', message: 'No appeal with that id' });
      }
      return;
    }

    const accept = req.headers.accept || '';
    if (accept.includes('text/html')) {
      res.type('html').send(renderPage(appeal));
    } else {
      res.json(appeal);
    }
  } catch (err) {
    logger.error({ err, appealId }, 'Failed to load appeal');
    res.status(500).json({ error: 'internal_error', message: 'Please try again later.' });
  }
});

/** GET /api/v1/appeals/:appealId — JSON status (for agent-automated callers). */
appealsRouter.get('/api/v1/appeals/:appealId', async (req: Request, res: Response) => {
  const appealId = req.params.appealId as string;
  if (!isValidAppealId(appealId)) {
    sendInvalidAppealId(req, res);
    return;
  }

  try {
    const appeal = await getAppeal(appealId);
    if (!appeal) {
      res.status(404).json({ error: 'not_found', message: 'No appeal with that id' });
      return;
    }
    res.json(appeal);
  } catch (err) {
    logger.error({ err, appealId }, 'Failed to load appeal');
    res.status(500).json({ error: 'internal_error', message: 'Please try again later.' });
  }
});

/** POST /appeals/:appealId AND /api/v1/appeals/:appealId — attach contact
 *  info + message to an OPEN appeal. Same handler, two paths: the HTML
 *  form posts to the page path; an agent-automated caller can use either. */
async function handleSubmit(req: Request, res: Response): Promise<void> {
  const requestId = req.headers[X_REQUEST_ID] as string | undefined;
  const appealId = req.params.appealId as string;

  if (!isValidAppealId(appealId)) {
    sendInvalidAppealId(req, res);
    return;
  }

  const rateCheck = await checkAppealSubmitRateLimit(appealId);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: 'rate_limited',
      message: 'Too many submissions for this appeal. Please try again later.',
      retry_after: rateCheck.retryAfter,
    });
    return;
  }

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      error: 'validation_error',
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
    return;
  }

  try {
    const result = await submitAppeal(appealId, parsed.data);
    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'not_found', message: 'No appeal with that id' });
        return;
      }
      res.status(409).json({
        error: 'already_resolved',
        message: 'This appeal has already been resolved.',
        appeal: result.appeal,
      });
      return;
    }

    logger.info({ requestId, appealId }, 'Appeal submission accepted');

    const accept = req.headers.accept || '';
    if (accept.includes('text/html')) {
      res.type('html').send(renderPage(result.appeal));
    } else {
      res.json({ status: 'accepted', appeal: result.appeal });
    }
  } catch (err) {
    logger.error({ err, requestId, appealId }, 'Failed to submit appeal');
    res.status(500).json({ error: 'internal_error', message: 'Please try again later.' });
  }
}

appealsRouter.post('/appeals/:appealId', handleSubmit);
appealsRouter.post('/api/v1/appeals/:appealId', handleSubmit);
