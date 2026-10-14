import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../config/logger';
import { checkIpRateLimit, createSubmission } from '../services/onboard.service';
import { X_REQUEST_ID } from '../config/http-headers';
import { metaTags, SITE_FOOTER, SITE_NAV, SITE_NAV_CSS } from '../shop/page-meta';

// ---------------------------------------------------------------------------
// Zod schema (§6.12)
// ---------------------------------------------------------------------------

const onboardSchema = z
  .object({
    company_name: z.string().min(1).max(256),
    api_url: z.string().url().max(2048),
    contact_email: z.string().email().max(256),
    category: z.enum(['travel', 'food', 'finance', 'e-commerce', 'other']),
    description: z.string().min(1).max(500),
    affiliate_program: z.string().url().max(2048).optional().or(z.literal('')),
    monthly_volume: z.string().max(64).optional().or(z.literal('')),
    _honeypot: z.string().optional(),
  })
  .strip();

// ---------------------------------------------------------------------------
// HTML form (inline, minimal — §AP-10)
// ---------------------------------------------------------------------------

const ICON_OPEN =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const OK_ICON = `${ICON_OPEN} stroke="#4fd283"><circle cx="12" cy="12" r="8.5"></circle><path d="M8 12.5l3 3 5-6"></path></svg>`;
const BAD_ICON = `${ICON_OPEN} stroke="#ff7262"><circle cx="12" cy="12" r="8.5"></circle><path d="M9 9l6 6M15 9l-6 6"></path></svg>`;
const CHECK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4fd283" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>`;
/** Inline error line under a field; the page script fills the last child and un-hides it. */
const err = (k: string): string =>
  `<p class="fm-err" id="ob-${k}-err" role="alert" hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"></path><path d="M12 10v4M12 17v.01"></path></svg><span></span></p>`;

const HTML_FORM = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>APIbase.pro — Onboard Your API</title>
${metaTags({
  title: 'APIbase.pro — Onboard Your API',
  description:
    'Submit your API for integration into APIbase.pro so AI agents can discover and call it per request.',
  path: '/onboard',
})}
<style>
${SITE_NAV_CSS}
</style>
</head>
<body>
${SITE_NAV}
<div class="page-shell fm">
<div class="container" id="main-content">
<div class="fm-grid">
<div class="fm-side">
<h1>Onboard Your API</h1>
<p class="fm-lead">Submit your API for integration into APIbase.pro</p>
<ul class="fm-checks">
<li>${CHECK}<span>Reach AI agents on MCP and REST</span></li>
<li>${CHECK}<span>Paid per call in USDC</span></li>
</ul>
<p><a class="m-link" href="/partners">More for partners</a></p>
</div>
<div class="fm-main">
<div class="fm-box" id="ob-sent" role="status" hidden>${OK_ICON}<div><strong>Thanks, your API is in review</strong><span id="ob-sent-text"></span></div></div>
<div class="fm-box bad" id="ob-fail" role="alert" hidden>${BAD_ICON}<div><strong>Could not send the form</strong><span id="ob-fail-text"></span></div></div>
<form id="ob-form" method="POST" action="/onboard" novalidate>
<div class="fm-f"><label for="ob-company_name">Company Name <span class="req" aria-hidden="true">*</span></label><input id="ob-company_name" name="company_name" required maxlength="256" autocomplete="organization">${err('company_name')}</div>
<div class="fm-f"><label for="ob-api_url">API URL <span class="req" aria-hidden="true">*</span></label><input id="ob-api_url" name="api_url" type="url" required maxlength="2048" placeholder="https://api.example.com" autocomplete="off">${err('api_url')}</div>
<div class="fm-f"><label for="ob-contact_email">Contact Email <span class="req" aria-hidden="true">*</span></label><input id="ob-contact_email" name="contact_email" type="email" required maxlength="256" autocomplete="email">${err('contact_email')}</div>
<div class="fm-f"><label for="ob-category">Category <span class="req" aria-hidden="true">*</span></label>
<select id="ob-category" name="category" required>
<option value="">Select...</option>
<option value="travel">Travel</option>
<option value="food">Food</option>
<option value="finance">Finance</option>
<option value="e-commerce">E-Commerce</option>
<option value="other">Other</option>
</select>${err('category')}</div>
<div class="fm-f wide"><label for="ob-description">Description <span class="req" aria-hidden="true">*</span></label><textarea id="ob-description" name="description" required maxlength="500" placeholder="Brief description of your API"></textarea>${err('description')}</div>
<div class="fm-f"><label for="ob-affiliate_program">Affiliate Program URL</label><input id="ob-affiliate_program" name="affiliate_program" type="url" maxlength="2048" placeholder="https://example.com/affiliates">${err('affiliate_program')}</div>
<div class="fm-f"><label for="ob-monthly_volume">Estimated Monthly Volume</label><input id="ob-monthly_volume" name="monthly_volume" maxlength="64" placeholder="e.g. 10,000 requests/month"></div>
<div class="hp"><label>Leave empty</label><input name="_honeypot" tabindex="-1" autocomplete="off"></div>
<div class="fm-box bad fm-note" id="ob-errors" role="note" hidden>${BAD_ICON}<div><strong>Check the highlighted fields</strong><span id="ob-errors-n"></span></div></div>
<div class="fm-actions"><button class="fm-btn p" id="ob-submit" type="submit">Submit</button></div>
<p class="fm-note">We review every submission manually and reply by email.</p>
</form>
</div>
</div>
</div>
</div>
<script>
(function(){
  var f=document.getElementById('ob-form');
  if(!f)return;
  var F=['company_name','api_url','contact_email','category','description','affiliate_program'];
  var LABEL={company_name:'Enter your company name',api_url:'Enter your API URL',contact_email:'Enter a contact email',category:'Choose a category',description:'Describe your API'};
  function el(k){return document.getElementById('ob-'+k)}
  function check(k,v){
    v=v.trim();
    if(k==='company_name')return v?'':LABEL[k];
    if(k==='api_url')return !v?LABEL[k]:!/^https?:\\/\\/[^\\s.]+\\.[^\\s]{2,}$/i.test(v)?'Start with https:// like https://api.example.com':'';
    if(k==='contact_email')return !v?LABEL[k]:!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(v)?'Enter a full email, like name@company.com':'';
    if(k==='category')return v?'':LABEL[k];
    if(k==='description')return v?(v.length>500?'Use at most 500 characters':''):LABEL[k];
    if(k==='affiliate_program')return v&&!/^https?:\\/\\/[^\\s.]+\\.[^\\s]{2,}$/i.test(v)?'Start with https:// like https://example.com':'';
    return '';
  }
  function show(k,msg){
    var i=el(k),e=document.getElementById('ob-'+k+'-err');
    i.setAttribute('aria-invalid',msg?'true':'false');
    i.setAttribute('aria-describedby','ob-'+k+'-err');
    e.hidden=!msg;e.lastChild.textContent=msg;
  }
  F.forEach(function(k){el(k).addEventListener('blur',function(){show(k,check(k,this.value))})});
  function fail(msg){
    document.getElementById('ob-fail-text').textContent=msg;
    document.getElementById('ob-fail').hidden=false;
  }
  f.addEventListener('submit',function(ev){
    ev.preventDefault();
    var n=0;
    F.forEach(function(k){var m=check(k,el(k).value);if(m)n++;show(k,m)});
    document.getElementById('ob-errors').hidden=!n;
    document.getElementById('ob-errors-n').textContent=n===1?'1 field needs attention before you can send.':n+' fields need attention before you can send.';
    document.getElementById('ob-fail').hidden=true;
    if(n)return;
    var body={_honeypot:f.elements._honeypot.value,monthly_volume:f.elements.monthly_volume.value.trim()};
    F.forEach(function(k){body[k]=el(k).value.trim()});
    var b=document.getElementById('ob-submit');
    b.disabled=true;
    fetch('/onboard',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json().catch(function(){return {}}).then(function(j){return {s:r.status,j:j}})})
      .then(function(x){
        b.disabled=false;
        if(x.s===200&&x.j.status==='accepted'){
          document.getElementById('ob-sent-text').textContent='Reference '+x.j.submission_id+'. We reply to '+body.contact_email+' after a manual review.';
          document.getElementById('ob-sent').hidden=false;
          f.hidden=true;
          return;
        }
        if(x.s===422&&x.j.errors){
          x.j.errors.forEach(function(e){if(F.indexOf(e.field)>=0)show(e.field,e.message)});
          document.getElementById('ob-errors').hidden=false;
          document.getElementById('ob-errors-n').textContent='The server rejected some fields. Check the highlighted fields.';
          return;
        }
        fail(x.j.message||'Please try again later.');
      })
      .catch(function(){b.disabled=false;fail('Network error. Check your connection and try again.')});
  });
})();
</script>
${SITE_FOOTER}
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
    category: {
      type: 'enum',
      values: ['travel', 'food', 'finance', 'e-commerce', 'other'],
      required: true,
    },
    description: { type: 'string', required: true, max: 500 },
    affiliate_program: { type: 'string', format: 'url', required: false, max: 2048 },
    monthly_volume: { type: 'string', required: false, max: 64 },
  },
};

/** HTML unless the client asks for JSON explicitly: application/json named and text/html not named. */
const wantsJson = (req: Request): boolean => {
  const a = req.get('accept');
  return typeof a === 'string' && /application\/json/i.test(a) && !/text\/html/i.test(a);
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const onboardRouter = Router();

/**
 * GET /onboard — HTML by default; JSON schema when Accept asks for
 * application/json without text/html (agent-automated submissions).
 */
onboardRouter.get('/onboard', (req: Request, res: Response) => {
  if (wantsJson(req)) {
    res.json(JSON_SCHEMA_RESPONSE);
  } else {
    res.type('html').send(HTML_FORM);
  }
});

/**
 * POST /onboard — Receive onboarding submission (§6.12)
 */
onboardRouter.post('/onboard', async (req: Request, res: Response) => {
  const requestId = req.headers[X_REQUEST_ID] as string | undefined;
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
      estimated_processing: 'manual review; reply by email',
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
      estimated_processing: 'manual review; reply by email',
    });
  } catch (err) {
    logger.error({ err, requestId, ip }, 'Failed to create onboarding submission');
    res.status(500).json({
      status: 'error',
      message: 'Internal error. Please try again later.',
    });
  }
});
