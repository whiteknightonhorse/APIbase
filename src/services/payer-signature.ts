import { verifyMessage } from 'viem';

/**
 * T-0554 / T-0770: the one wallet-signature check shared by GET /x402/retrieve/:id and
 * GET /api/v1/shop/orders/:id. EIP-191 personal_sign over `<prefix>:<id>:<unix minute>`,
 * accepted for the current or the previous minute.
 */
export type SignatureVerifier = (a: {
  address: `0x${string}`;
  message: string;
  signature: `0x${string}`;
}) => Promise<boolean>;

export const defaultVerifier: SignatureVerifier = (a) => verifyMessage(a);

export const PAYER_SIG_RE = /^0x[0-9a-fA-F]{130}$/;
export const PAYER_ADDR_RE = /^0x[0-9a-f]{40}$/;

/** True when `signature` by `address` signs messageFor(minute) for the current or previous minute. */
export async function signedWithinMinute(
  verify: SignatureVerifier,
  address: string,
  signature: string,
  messageFor: (minute: number) => string,
  nowMs: number,
): Promise<boolean> {
  const minute = Math.floor(nowMs / 60_000);
  for (const m of [minute, minute - 1]) {
    try {
      if (
        await verify({
          address: address as `0x${string}`,
          message: messageFor(m),
          signature: signature as `0x${string}`,
        })
      ) {
        return true;
      }
    } catch {
      // a malformed signature is simply not valid
    }
  }
  return false;
}
