import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../config/logger';
import { checkIpRateLimit, createSubmission } from '../services/onboard.service';

// ---------------------------------------------------------------------------
// Zod schema (§6.12)
// ---------------------------------------------------------------------------

const onboardSchema = z.object({
  company_name: z.string().min(1).max(256),
  api_url: z.string().url().max(2048),
  contact_email: z.string().email().max(256),
  category: z.enum(['travel', 'food', 'finance', 'e-commerce', 'other']),
  description: z.string().min(1).max(500),
  affiliate_program: z.string().url().max(2048).optional().or(z.literal('')),
  monthly_volume: z.string().max(64).optional().or(z.literal('')),
  _honeypot: z.string().optional(),
}).strip();

// ---------------------------------------------------------------------------
// HTML form (inline, minimal — §AP-10)
// ---------------------------------------------------------------------------

const HTML_FORM = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>APIbase.pro — Onboard Your API</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e0e0e0;display:flex;justify-content:center;padding:2rem}
.card{max-width:520px;width:100%;background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:2rem}
h1{font-size:1.5rem;margin-bottom:.25rem;color:#fff}
p.sub{color:#888;margin-bottom:1.5rem;font-size:.9rem}
label{display:block;font-size:.85rem;color:#aaa;margin-bottom:.25rem;margin-top:1rem}
input,select,textarea{width:100%;padding:.6rem .75rem;background:#111;border:1px solid #333;border-radius:6px;color:#e0e0e0;font-size:.9rem}
input:focus,select:focus,textarea:focus{outline:none;border-color:#3b82f6}
textarea{resize:vertical;min-height:80px}
.hp{position:absolute;left:-9999px;opacity:0;height:0;width:0;overflow:hidden}
button{margin-top:1.5rem;width:100%;padding:.75rem;background:#3b82f6;color:#fff;border:none;border-radius:6px;font-size:1rem;cursor:pointer}
button:hover{background:#2563eb}
.req{color:#ef4444}
small{color:#666;font-size:.75rem}
</style>
</head>
<body>
<div class="card">
<h1>Onboard Your API</h1>
<p class="sub">Submit your API for integration into APIbase.pro</p>
<form method="POST" action="/onboard">
<label>Company Name <span class="req">*</span></label>
<input name="company_name" required maxlength="256">

<label>API URL <span class="req">*</span></label>
<input name="api_url" type="url" required maxlength="2048" placeholder="https://api.example.com">

<label>Contact Email <span class="req">*</span></label>
<input name="contact_email" type="email" required maxlength="256">

<label>Category <span class="req">*</span></label>
<select name="category" required>
<option value="">Select...</option>
<option value="travel">Travel</option>
<option value="food">Food</option>
<option value="finance">Finance</option>
<option value="e-commerce">E-Commerce</option>
<option value="other">Other</option>
</select>

<label>Description <span class="req">*</span></label>
<textarea name="description" required maxlength="500" placeholder="Brief description of your API"></textarea>

<label>Affiliate Program URL</label>
<input name="affiliate_program" type="url" maxlength="2048">

<label>Estimated Monthly Volume</label>
<input name="monthly_volume" maxlength="64" placeholder="e.g. 10,000 requests/month">

<div class="hp"><label>Leave empty</label><input name="_honeypot" tabindex="-1" autocomplete="off"></div>

<button type="submit">Submit</button>
<small style="display:block;margin-top:.75rem;text-align:center">We review submissions within 24-48 hours.</small>
</form>
</div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// JSON schema response (for agent-automated submissions)
// ---------------------------------------------------------------------------

const JSON_SCHEMA_RESPONSE = {
  endpoint: 'POST /onboard',
  content_type: 'application/json',
  fields: {
    company_name: { type: 'string', required: true, max: 256 },
    api_url: { type: 'string', format: 'url', required: true, max: 2048 },
    contact_email: { type: 'string', format: 'email', required: true, max: 256 },
    category: { type: 'enum', values: ['travel', 'food', 'finance', 'e-commerce', 'other'], required: true },
    description: { type: 'string', required: true, max: 500 },
    affiliate_program: { type: 'string', format: 'url', required: false, max: 2048 },
    monthly_volume: { type: 'string', required: false, max: 64 },
  },
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const onboardRouter = Router();

/**
 * GET /onboard — Serve HTML form or JSON schema (§6.12)
 */
onboardRouter.get('/onboard', (req: Request, res: Response) => {
  const accept = req.headers.accept || '';

  if (accept.includes('text/html')) {
    res.type('html').send(HTML_FORM);
  } else {
    res.json(JSON_SCHEMA_RESPONSE);
  }
});

/**
 * POST /onboard — Receive onboarding submission (§6.12)
 */
onboardRouter.post('/onboard', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string | undefined;
  const ip = req.ip || '0.0.0.0';

  // 1. IP rate limit
  const rateCheck = await checkIpRateLimit(ip);
  if (!rateCheck.allowed) {
    res.status(429).json({
      status: 'rate_limited',
      message: 'Too many submissions. Please try again later.',
      retry_after: rateCheck.retryAfter,
    });
    return;
  }

  // 2. Parse + validate
  const parsed = onboardSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    res.status(422).json({ status: 'validation_error', errors });
    return;
  }

  const data = parsed.data;

  // 3. Honeypot check — silent discard
  if (data._honeypot) {
    logger.info({ requestId, ip }, 'Honeypot triggered, silently discarding');
    res.json({
      status: 'accepted',
      submission_id: `sub_${Date.now().toString(16)}`,
      message: 'Your submission has been received.',
      estimated_processing: '24-48 hours',
    });
    return;
  }

  // 4. Create submission + outbox event
  try {
    const result = await createSubmission(data, ip);

    logger.info(
      { requestId, submissionId: result.submission_id, ip },
      'Onboarding submission created',
    );

    res.json({
      status: 'accepted',
      submission_id: result.submission_id,
      message: 'Your submission has been received and will be reviewed.',
      estimated_processing: '24-48 hours',
    });
  } catch (err) {
    logger.error({ err, requestId, ip }, 'Failed to create onboarding submission');
    res.status(500).json({
      status: 'error',
      message: 'Internal error. Please try again later.',
    });
  }
});
