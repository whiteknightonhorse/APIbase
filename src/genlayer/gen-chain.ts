/**
 * A-GD-01: the Bradbury chain object shared by the /attest/ page and the dispute worker. The
 * 2.0.0-rc.2 preset points at an RPC that does not serve gen_call, so the chain is the preset with
 * the caller's RPC and explorer. The preset is passed in: the page imports it statically, the
 * worker (CommonJS, genlayer-js is ESM-only) through a dynamic import.
 */
export const BRADBURY_RPC_URL = 'https://rpc-bradbury.genlayer.com';
export const BRADBURY_EXPLORER = 'https://scan.bradbury.genlayer.com';

export function bradburyChain<P extends object>(
  preset: P,
  rpcUrl: string = BRADBURY_RPC_URL,
  explorer: string = BRADBURY_EXPLORER,
) {
  return {
    ...preset,
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: 'GenLayer Scan', url: explorer } },
  };
}
