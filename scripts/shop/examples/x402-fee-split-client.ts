import { randomBytes } from 'node:crypto';
import type { PrivateKeyAccount } from 'viem/accounts';

/**
 * Example x402 client for the Base fee-split (T-INT-42): signs two EIP-3009
 * TransferWithAuthorization messages from one wallet and assembles the `X-Payment` header.
 *
 * Input is the 402 body of `POST /api/v1/shop/quotes/:id/pay`. When `accepts[0].extra.fee_split`
 * is absent (fee off, or fee-split not offered) it signs the single authorization for `amount`.
 */
export interface FeeSplitChallenge {
  accepts: Array<{
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    extra: {
      name?: string;
      version?: string;
      fee_split?: { v: number; fee_to: string; fee_amount: string; merchant_amount: string };
    };
  }>;
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
  c: FeeSplitChallenge['accepts'][0],
  to: string,
  value: string,
  validBefore: number,
) {
  const chainId = Number(c.network.split(':')[1]);
  const authorization = {
    from: account.address,
    to,
    value,
    validAfter: '0',
    validBefore: String(validBefore),
    nonce: `0x${randomBytes(32).toString('hex')}`,
  };
  const signature = await account.signTypedData({
    domain: {
      name: c.extra.name ?? 'USD Coin',
      version: c.extra.version ?? '2',
      chainId,
      verifyingContract: c.asset as `0x${string}`,
    },
    types: TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: to as `0x${string}`,
      value: BigInt(value),
      validAfter: 0n,
      validBefore: BigInt(validBefore),
      nonce: authorization.nonce as `0x${string}`,
    },
  });
  return { authorization, signature };
}

/** The payment payload object (before base64). */
export async function buildFeeSplitPaymentPayload(
  account: PrivateKeyAccount,
  challenge: FeeSplitChallenge,
  validBefore: number = Math.floor(Date.now() / 1000) + 600,
): Promise<Record<string, unknown>> {
  const c = challenge.accepts[0];
  const split = c.extra.fee_split;
  if (!split) {
    const only = await signLeg(account, c, c.payTo, c.amount, validBefore);
    return { x402Version: 2, accepted: c, payload: only };
  }
  const merchant = await signLeg(account, c, c.payTo, split.merchant_amount, validBefore);
  const fee = await signLeg(account, c, split.fee_to, split.fee_amount, validBefore);
  return { x402Version: 2, accepted: c, payload: { ...merchant, feeAuthorization: fee } };
}

/** The `X-Payment` header value: base64 of the JSON payload. */
export async function buildFeeSplitXPayment(
  account: PrivateKeyAccount,
  challenge: FeeSplitChallenge,
  validBefore?: number,
): Promise<string> {
  const payload = await buildFeeSplitPaymentPayload(account, challenge, validBefore);
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}
