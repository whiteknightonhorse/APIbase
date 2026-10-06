import { verifyMessage } from 'viem';
import { ShopAuthError } from './auth/errors';

export type SignerKind = 'eoa' | 'contract';

/** The chain read failed: never a 200 and never a 401 (spec A3-6, fail-closed). */
export class AuthUnavailable extends ShopAuthError {
  readonly error_code = 'auth_unavailable';
  constructor() {
    super(503, 'wallet signature check unavailable', 'retry_after_delay');
    this.name = 'AuthUnavailable';
  }
}

/** The subset of a viem PublicClient used here (also what tests mock). */
export interface SignaturePublicClient {
  getCode(args: { address: `0x${string}` }): Promise<string | undefined>;
  verifyMessage(args: {
    address: `0x${string}`;
    message: string;
    signature: `0x${string}`;
  }): Promise<boolean>;
}

let override: SignaturePublicClient | undefined;
let cached: SignaturePublicClient | undefined;

/** Test seam: replace the chain client (pass undefined to restore the real one). */
export function setSignaturePublicClient(c: SignaturePublicClient | undefined): void {
  override = c;
}

async function client(): Promise<SignaturePublicClient> {
  if (override) return override;
  if (!cached) {
    const { createPublicClient, http } = await import('viem');
    const { getX402Config } = await import('../config/x402.config');
    cached = createPublicClient({
      transport: http(getX402Config().baseRpcUrl),
    }) as unknown as SignaturePublicClient;
  }
  return cached;
}

/**
 * The ONE wallet-signature check of the shop (EIP-191 for EOAs, ERC-1271 / ERC-6492 for contract
 * wallets). No code at the address -> local EOA recovery. Code present -> viem's universal
 * validator via RPC. An RPC failure throws AuthUnavailable; a bad signature is `ok: false`.
 */
export async function verifyWalletSignature(a: {
  address: string;
  message: string;
  signature: string;
}): Promise<{ ok: boolean; signer_kind: SignerKind }> {
  const address = a.address.toLowerCase() as `0x${string}`;
  const signature = a.signature as `0x${string}`;
  if (!/^0x[0-9a-fA-F]+$/.test(a.signature ?? '')) return { ok: false, signer_kind: 'eoa' };
  let code: string | undefined;
  let c: SignaturePublicClient;
  try {
    c = await client();
    code = await c.getCode({ address });
  } catch {
    throw new AuthUnavailable();
  }
  if (!code || code === '0x') {
    try {
      const ok = await verifyMessage({ address, message: a.message, signature });
      return { ok, signer_kind: 'eoa' };
    } catch {
      return { ok: false, signer_kind: 'eoa' };
    }
  }
  try {
    const ok = await c.verifyMessage({ address, message: a.message, signature });
    return { ok, signer_kind: 'contract' };
  } catch {
    throw new AuthUnavailable();
  }
}
