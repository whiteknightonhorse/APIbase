/**
 * A-GD-01: genlayer-js clients of the dispute worker (read client and the writer signed by its own
 * key). genlayer-js is ESM-only and the server is CommonJS on Node 20, so it is loaded with a real
 * dynamic import, on first use; unit tests inject a stub port instead and never reach this file.
 */
import { bradburyChain, BRADBURY_RPC_URL } from './gen-chain';
import type { GenReadClient } from './gen-call';

// `import()` written through Function so the CommonJS build keeps it a true dynamic import.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const esmImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;

async function chainFor(rpcUrl: string) {
  const { testnetBradbury } = await esmImport('genlayer-js/chains');
  return bradburyChain(testnetBradbury, rpcUrl);
}

export async function makeReadClient(rpcUrl: string = BRADBURY_RPC_URL): Promise<GenReadClient> {
  const { createClient } = await esmImport('genlayer-js');
  return createClient({ chain: await chainFor(rpcUrl) }) as GenReadClient;
}

/** What the worker needs to sign a contract call with its own key: quote the fee, then send. */
export interface GenWriteClient {
  estimateTransactionFeesForWrite(a: unknown): Promise<{ feeValue: bigint; distribution: unknown }>;
  writeContract(a: unknown): Promise<unknown>;
}

/** The key is read by the caller from GL_DISPUTE_KEY and never logged or stored here. */
export async function makeWriteClient(rpcUrl: string, privateKey: string): Promise<GenWriteClient> {
  const { createClient, createAccount } = await esmImport('genlayer-js');
  const account = createAccount(privateKey);
  return createClient({ chain: await chainFor(rpcUrl), account }) as GenWriteClient;
}

/** Quote then send one write; same fee procedure as the /attest/ page. Returns the tx hash. */
export async function sendWrite(
  client: GenWriteClient,
  address: string,
  functionName: string,
  args: unknown[],
): Promise<string> {
  const est = await client.estimateTransactionFeesForWrite({
    address,
    functionName,
    args,
    value: 0n,
  });
  const hash = await client.writeContract({
    address,
    functionName,
    args,
    value: 0n,
    fees: { distribution: est.distribution, feeValue: est.feeValue },
  });
  return String(hash);
}
