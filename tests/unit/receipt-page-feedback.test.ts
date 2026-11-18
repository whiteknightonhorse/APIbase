import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { AGENT_SCAN_URL, renderReceiptPage } from '../../src/routes/dispute-page.router';

const ID = '9dbc77f9fd66bcb8714cd064f5681005';
const OUTSIDE = '0x1111111111111111111111111111111111111111';
const wallets = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'config', 'autopilot', 'internal-wallets.json'), 'utf8'),
) as Array<{ address: string }>;
const receipt = (payer: string): string => JSON.stringify({ receipt_id: ID, payer, billed: true });

describe('receipt page feedback hint (T-0911)', () => {
  it('shows the block with the agent URL and the receipt URL to an outside payer', () => {
    const html = renderReceiptPage(ID, receipt(OUTSIDE));
    expect(html).toContain('<h2>Rate APIbase</h2>');
    expect(html).toContain(`href="${AGENT_SCAN_URL}"`);
    expect(html).toContain(`https://apibase.pro/r/${ID}.json`);
    expect(html).toContain('/policy/test-wallets.json');
  });

  it('shows no block for any address of internal-wallets.json', () => {
    expect(wallets.length).toBeGreaterThan(0);
    for (const w of wallets) {
      expect(renderReceiptPage(ID, receipt(w.address))).not.toContain('Rate APIbase');
      expect(
        renderReceiptPage(ID, receipt(w.address.toUpperCase().replace('0X', '0x'))),
      ).not.toContain('Rate APIbase');
    }
  });

  it('shows no block for an unreadable body', () => {
    for (const bad of ['not json', 'null', '[]', '123', '{}', JSON.stringify({ payer: 5 })]) {
      const html = renderReceiptPage(ID, bad);
      expect(html).not.toContain('Rate APIbase');
    }
    expect(renderReceiptPage(ID, 'null')).toContain('not readable as JSON');
  });
});
