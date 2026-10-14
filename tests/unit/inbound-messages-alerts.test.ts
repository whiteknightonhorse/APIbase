import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const SCRIPTS = join(__dirname, '../../scripts');

describe('T-SITE-D inbound messages', () => {
  it.each(['inbound-messages-alerts.py', 'onboard-review.py'])('%s --selftest passes', (name) => {
    const out = execFileSync('python3', [join(SCRIPTS, name), '--selftest']);
    expect(out.toString()).toContain('OK');
  });

  it('processor.ts no longer lists form_submission as a handled event type', () => {
    const src = readFileSync(join(__dirname, '../../src/outbox/processor.ts'), 'utf8');
    const list = src.slice(src.indexOf('export const HANDLED_EVENT_TYPES'));
    expect(list.slice(0, list.indexOf('] as const'))).not.toContain('form_submission');
    expect(src).not.toContain("eventType === 'form_submission'");
    expect(src).toContain('scripts/inbound-messages-alerts.py');
  });
});
