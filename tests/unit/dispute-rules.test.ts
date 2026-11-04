/**
 * A-GD-01: the deterministic refund rule of the GenLayer dispute contract, written once
 * (src/payments/dispute-rules.ts). The fixtures follow the shapes of the Provek contract tests.
 */
import {
  atomicToUsd,
  judgePayment,
  judgeReceipt,
  sameRefund,
  type PaymentFacts,
} from '../../src/payments/dispute-rules';

const PAYER = '0x' + 'a1'.repeat(20);
const PAYEE = '0x50ebda9da5dc19c302ca059d7b9e06e264936480';
const TX = '0x' + 'c3'.repeat(32);

const receipt = (over: Record<string, unknown> = {}) => ({
  schema: 'apibase-receipt/1',
  rail: 'x402-base',
  billed: true,
  upstream_status: 503,
  payer: PAYER,
  amount_atomic: '1000000',
  ...over,
});

describe('judgeReceipt (upstream_failed_but_billed)', () => {
  it('REFUND on a billed 5xx receipt, payer and amount copied from it', () => {
    expect(judgeReceipt(receipt())).toEqual({
      verdict: 'REFUND',
      reason: 'upstream_failed_but_billed',
      payer: PAYER,
      amount_atomic: '1000000',
    });
  });
  it('RELEASE for a 2xx receipt and for an unbilled one', () => {
    expect(judgeReceipt(receipt({ upstream_status: 200 }))).toEqual({
      verdict: 'RELEASE',
      reason: 'upstream_status_200',
    });
    expect(judgeReceipt(receipt({ billed: false }))).toEqual({
      verdict: 'RELEASE',
      reason: 'not_billed',
    });
  });
  it.each([
    [null],
    ['x'],
    [receipt({ schema: 'other' })],
    [receipt({ rail: 'mpp-tempo' })],
    [receipt({ payer: 'nope' })],
    [receipt({ amount_atomic: '1.5' })],
    [receipt({ upstream_status: '503' })],
  ])('unreadable input %#', (r) => {
    expect(judgeReceipt(r).verdict).toBe('UNREADABLE');
  });
});

const facts = (over: Partial<PaymentFacts> = {}): PaymentFacts => ({
  tx: TX,
  index: { payment_tx: TX, receipt_ids: [], refund_tx: null },
  chain: { status: 1, transfers: [{ from: PAYER, to: PAYEE, value_atomic: '250000' }] },
  payee: PAYEE,
  ...over,
});

describe('judgePayment (paid_without_receipt)', () => {
  it('REFUND when a USDC transfer reached the payee and no receipt or refund exists', () => {
    expect(judgePayment(facts())).toEqual({
      verdict: 'REFUND',
      reason: 'paid_without_receipt',
      payer: PAYER,
      amount_atomic: '250000',
    });
  });
  it.each([
    [
      'already refunded',
      { index: { payment_tx: TX, receipt_ids: [], refund_tx: '0x' + 'e'.repeat(64) } },
      'already_refunded',
    ],
    [
      'receipt exists',
      { index: { payment_tx: TX, receipt_ids: ['r1'], refund_tx: null } },
      'receipt_exists:r1',
    ],
    ['other refund verdict', { otherRefundVerdict: 'd9' }, 'refund_verdict_exists:d9'],
    ['tx unknown to the node', { chain: null }, 'tx_not_found'],
    ['tx reverted', { chain: { status: 0, transfers: [] } }, 'tx_reverted'],
    [
      'transfer went elsewhere',
      {
        chain: {
          status: 1,
          transfers: [{ from: PAYER, to: '0x' + '9'.repeat(40), value_atomic: '1' }],
        },
      },
      'no_payment_to_apibase',
    ],
  ])('RELEASE: %s', (_n, over, reason) => {
    expect(judgePayment(facts(over as Partial<PaymentFacts>))).toEqual({
      verdict: 'RELEASE',
      reason,
    });
  });
  it('an unreadable or foreign index is UNREADABLE, never "no receipt"', () => {
    expect(judgePayment(facts({ index: null })).verdict).toBe('UNREADABLE');
    expect(
      judgePayment(
        facts({ index: { payment_tx: '0x' + 'd'.repeat(64), receipt_ids: [], refund_tx: null } }),
      ).verdict,
    ).toBe('UNREADABLE');
  });
});

describe('sameRefund / atomicToUsd', () => {
  const local = judgeReceipt(receipt());
  const claim = {
    verdict: 'REFUND' as const,
    claim: 'upstream_failed_but_billed' as const,
    payer: PAYER.toUpperCase().replace('0X', '0x'),
    amount_atomic: '1000000',
  };
  it('matches on claim, payer (case-insensitive) and amount', () => {
    expect(sameRefund(claim, local)).toBe(true);
  });
  it('differs on amount, claim type or a RELEASE', () => {
    expect(sameRefund({ ...claim, amount_atomic: '1000001' }, local)).toBe(false);
    expect(sameRefund({ ...claim, claim: 'paid_without_receipt' }, local)).toBe(false);
    expect(sameRefund(claim, judgeReceipt(receipt({ upstream_status: 200 })))).toBe(false);
  });
  it('converts atomic USDC to a decimal USD string', () => {
    expect(atomicToUsd('1000000')).toBe('1.000000');
    expect(atomicToUsd('250000')).toBe('0.250000');
    expect(atomicToUsd('1')).toBe('0.000001');
    expect(atomicToUsd('25000000')).toBe('25.000000');
  });
});
