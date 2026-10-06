import { randomBytes } from 'node:crypto';
import type { PrivateKeyAccount } from 'viem/accounts';

/**
 * Example client for Base pull subscriptions (T-INT-47): signs one EIP-3009
 * TransferWithAuthorization per FUTURE period with viem `signTypedData` and returns the body of
 * `POST /api/v1/shop/subscriptions/:id/preauthorize` (or the arguments of the MCP tool
 * `shop.subscription.preauthorize`).
 *
 * Per period: `from` = the wallet that paid the subscription (the signing account), `to` = the shop
 * payout wallet, `value` = the plan price in micro-USDC, `validAfter` = the unix start of the
 * period, `validBefore` between 1 h and 72 h after it, a fresh random nonce.
 *
 * With the platform fee on, pass `fee`: the first authorization is then `value - fee.amount`, and a
 * second one pays `fee.amount` to `fee.to` (the fee wallet; same validity window, its own nonce).
 * The fee is then settled in the same transaction. Without `fee` the whole price goes to the shop
 * and the fee is invoiced to the shop instead.
 *
 * Period n starts when period n-1 ends: for the next period that is `current_period_end` of
 * `shop.subscription.get`; a rejected start is answered with the expected unix value.
 *
 * To revoke a stored authorization before it runs, call `cancelAuthorization(authorizer, nonce,
 * signature)` on the USDC contract (`signature` signs the EIP-3009 `CancelAuthorization` message
 * over `{authorizer, nonce}`), or cancel the subscription: stored authorizations are never run
 * after `shop.subscription.cancel`.
 */
export interface PreauthTerms {
  /** USDC contract and chain of the shop's 402 challenge (`accepts[0].asset`, `network`). */
  asset: string;
  chainId: number;
  /** The shop payout wallet (`accepts[0].payTo` of a quote). */
  payTo: string;
  /** The plan price of ONE period, micro-USDC (`accepts[0].amount`). */
  amountMicro: string;
  fee?: { to: string; amountMicro: string };
  /** Periods to pre-authorize: number and start (unix seconds). */
  periods: Array<{ period_no: number; start: number }>;
  /** How long each authorization stays valid after its period start; 1..72 h. Default 24. */
  validForHours?: number;
}

const TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

async function signLeg(
  account: PrivateKeyAccount,
  t: PreauthTerms,
  to: string,
  value: string,
  validAfter: number,
  validBefore: number,
) {
  const nonce = `0x${randomBytes(32).toString('hex')}`;
  const authorization = {
    from: account.address,
    to,
    value,
    validAfter: String(validAfter),
    validBefore: String(validBefore),
    nonce,
  };
  const signature = await account.signTypedData({
    domain: {
      name: 'USD Coin',
      version: '2',
      chainId: t.chainId,
      verifyingContract: t.asset as `0x${string}`,
    },
    types: TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: to as `0x${string}`,
      value: BigInt(value),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: nonce as `0x${string}`,
    },
  });
  return { authorization, signature };
}

export interface PreauthItem {
  period_no: number;
  authorization: Record<string, string>;
  signature: string;
  fee_authorization?: { authorization: Record<string, string>; signature: string };
}

/** The `authorizations` array of the preauthorize call (1..12 items). */
export async function buildPreauthorizations(
  account: PrivateKeyAccount,
  t: PreauthTerms,
): Promise<PreauthItem[]> {
  const hours = t.validForHours ?? 24;
  const out: PreauthItem[] = [];
  for (const p of t.periods) {
    const before = p.start + Math.round(hours * 3600);
    const merchantValue = t.fee
      ? String(BigInt(t.amountMicro) - BigInt(t.fee.amountMicro))
      : t.amountMicro;
    const m = await signLeg(account, t, t.payTo, merchantValue, p.start, before);
    const item: PreauthItem = { period_no: p.period_no, ...m };
    if (t.fee)
      item.fee_authorization = await signLeg(
        account,
        t,
        t.fee.to,
        t.fee.amountMicro,
        p.start,
        before,
      );
    out.push(item);
  }
  return out;
}
