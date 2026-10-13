/** T-0390: /onboard and /contact forms in design M keep their field names, labels and a parsable page script. */
import express from 'express';
import { readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { onboardRouter } from '../../src/routes/onboard.router';

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/config/index', () => ({ config: {} }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/onboard.service', () => ({
  checkIpRateLimit: jest.fn(),
  createSubmission: jest.fn(),
}));

let server: ReturnType<express.Express['listen']>;
let html: string;
beforeAll(async () => {
  const app = express();
  app.use(onboardRouter);
  server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  html = await (await fetch(`${base}/onboard`, { headers: { accept: 'text/html' } })).text();
  if (process.env.FORMS_DUMP) writeFileSync(process.env.FORMS_DUMP, html);
});
afterAll(() => server.close());

const FIELDS = [
  'company_name',
  'api_url',
  'contact_email',
  'category',
  'description',
  'affiliate_program',
  'monthly_volume',
  '_honeypot',
];

const scripts = (s: string): string[] =>
  [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

describe('T-0390 forms in design M', () => {
  it('F1: /onboard keeps every POST field name, the honeypot and a labelled control per field', () => {
    for (const f of FIELDS) expect(html).toContain(`name="${f}"`);
    expect(html).toContain('<form id="ob-form" method="POST" action="/onboard"');
    for (const f of FIELDS.filter((x) => x !== '_honeypot')) {
      expect(html).toContain(`for="ob-${f}"`);
    }
    expect(html).toContain('We review submissions within 24-48 hours.');
  });

  it('F2: every page script of /onboard and /contact parses', () => {
    const contact = readFileSync('static/contact.html', 'utf-8');
    for (const s of [...scripts(html), ...scripts(contact)]) {
      expect(() => new Function(s)).not.toThrow();
    }
  });

  it('F3: client-side regexes survived the template literal (backslashes intact)', () => {
    const s = scripts(html).join('\n');
    expect(s).toContain('[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}');
    expect(s).toContain('^https?:\\/\\/');
  });

  it('F4: /contact keeps the support address and has inline error slots for all three fields', () => {
    const c = readFileSync('static/contact.html', 'utf-8');
    expect(c).toContain('href="mailto:support@apibase.pro"');
    for (const id of ['c-name-err', 'c-email-err', 'c-message-err']) expect(c).toContain(id);
  });
});
