/** Addresses the platform itself controls; a merchant must never be paid to one of them (custody by accident). */
const PLATFORM_WALLET_ENV = [
  'X402_PAYMENT_ADDRESS',
  'TEMPO_WALLET_ADDRESS',
  'INTEGRATOR_FEE_WALLET',
  'INTEGRATOR_FEE_WALLET_BASE',
] as const;

export const PAYOUT_WALLET_PLATFORM_MSG =
  'this address belongs to the platform; use your own wallet';

export function platformWallets(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const out = new Set<string>();
  for (const name of PLATFORM_WALLET_ENV) {
    const v = env[name];
    if (typeof v === 'string' && v.trim() !== '') out.add(v.trim().toLowerCase());
  }
  return out;
}

export function isPlatformWallet(addr: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof addr === 'string' && platformWallets(env).has(addr.trim().toLowerCase());
}
