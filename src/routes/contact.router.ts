import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { logger } from '../config/logger';
import { getPrisma } from '../services/prisma.service';
import { X_REQUEST_ID } from '../config/http-headers';
import { fitTitle, metaTags, SITE_FOOTER, SITE_NAV, SITE_NAV_CSS } from '../shop/page-meta';

// ---------------------------------------------------------------------------
// POST /api/v1/contact — T-SITE-C. Same shape as onboarding (§6.12):
// route -> row -> outbox event. The outbox consumer is a host script, not the processor.
// ---------------------------------------------------------------------------

const contactSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(256),
    message: z.string().trim().min(10).max(1500),
    website: z.string().max(256).optional(),
  })
  .strip();

const newMessageId = (): string => `cm_${crypto.randomBytes(6).toString('hex')}`;

// 5 submissions per address per hour. In-process store: no external dependency to fail, and a
// store error passes the request through (contact is not a financial path, same as onboard).
export const contactLimiter = rateLimit({
  windowMs: 3_600_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  passOnStoreError: true,
  handler: (_req, res) => {
    res.status(429).json({
      status: 'rate_limited',
      message: 'Too many messages. Please try again later.',
    });
  },
});

export const contactRouter = Router();

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** No-JS fallback: a browser form post (Accept prefers HTML) gets a page, fetch() keeps JSON. */
const wantsHtml = (req: Request): boolean => req.accepts(['json', 'html']) === 'html';

function resultPage(title: string, bodyHtml: string): string {
  const t = fitTitle(`${title} — APIbase contact`);
  return (
    '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    metaTags({
      title: t,
      description: 'Contact APIbase: the result of your message.',
      path: '/contact',
    }) +
    '<meta name="robots" content="noindex">' +
    `<title>${esc(t)}</title><style>${SITE_NAV_CSS}</style></head><body>` +
    SITE_NAV +
    `<main id="main-content" style="max-width:720px;margin:32px auto;padding:0 16px"><h1>${esc(title)}</h1>${bodyHtml}<p><a href="/contact">Back to contact</a></p></main>` +
    SITE_FOOTER +
    '</body></html>\n'
  );
}

function sendAccepted(req: Request, res: Response, messageId: string): void {
  if (wantsHtml(req)) {
    res
      .type('html')
      .send(
        resultPage(
          'Message recorded',
          `<p>Message recorded, id <code>${esc(messageId)}</code>.</p>`,
        ),
      );
    return;
  }
  res.json({ status: 'accepted', message_id: messageId });
}

contactRouter.post('/api/v1/contact', contactLimiter, async (req: Request, res: Response) => {
  const requestId = req.headers[X_REQUEST_ID] as string | undefined;
  const ip = req.ip || '0.0.0.0';

  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    if (wantsHtml(req)) {
      const items = errors.map((e) => `<li>${esc(e.field)}: ${esc(e.message)}</li>`).join('');
      res
        .status(422)
        .type('html')
        .send(resultPage('Message not sent', `<p>Check these fields:</p><ul>${items}</ul>`));
      return;
    }
    res.status(422).json({ status: 'validation_error', errors });
    return;
  }
  const data = parsed.data;
  const messageId = newMessageId();

  // Honeypot: look accepted, store nothing.
  if (typeof data.website === 'string' && data.website.length > 0) {
    logger.info({ requestId, ip }, 'Contact honeypot triggered, silently discarding');
    sendAccepted(req, res, messageId);
    return;
  }

  try {
    const db = getPrisma();
    await db.$transaction([
      db.contactMessage.create({
        data: {
          message_id: messageId,
          name: data.name,
          email: data.email,
          message: data.message,
          ip_address: ip,
        },
      }),
      // PII (email, message) stays in the table; the consumer reads it by message_id.
      db.outbox.create({
        data: {
          event_type: 'contact_message',
          payload: { message_id: messageId, name: data.name },
        },
      }),
    ]);
    logger.info({ requestId, messageId, ip }, 'Contact message stored');
    sendAccepted(req, res, messageId);
  } catch (err) {
    logger.error({ err, requestId, ip }, 'Failed to store contact message');
    res.status(500).json({ status: 'error', message: 'Internal error. Please try again later.' });
  }
});
