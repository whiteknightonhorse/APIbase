import { readFileSync } from 'fs';
import { join } from 'path';

describe('static/privacy.html contact-form retention (T-0416)', () => {
  const html = readFileSync(join(__dirname, '../../static/privacy.html'), 'utf8');

  it('states contact messages are kept for 12 months', () => {
    expect(html).toMatch(/contact[^<]*<\/a> form[^<]*12 months/i);
  });

  it('names the stored fields and the purposes', () => {
    expect(html).toMatch(/IP address/);
    expect(html).toMatch(/prevent abuse/);
  });
});
