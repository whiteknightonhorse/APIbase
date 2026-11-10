/**
 * A-GA-02: genlayer-js access of the /attest/ page. Reads go straight from the browser to the
 * Bradbury RPC; the write is signed by the visitor's own browser wallet (window.ethereum). The
 * page holds no key and relays nothing.
 */
import { createClient } from 'genlayer-js';
import { testnetBradbury as presetBradbury } from 'genlayer-js/chains';
import { bradburyChain } from '../../src/genlayer/gen-chain';
import { genCall, withTimeout, type GenReadClient } from '../../src/genlayer/gen-call';
import { quote, quoteCall, send, sendCall, type FeeQuote, type WriteClient } from './write';
import { CHAIN_ID, CONTRACT_ADDRESS, EXPLORER_BASE, RPC_TIMEOUT_MS, RPC_URL } from './attest-view';

interface EthProvider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

type Hex = `0x${string}`;

function injected(): EthProvider | null {
  const w = window as unknown as { ethereum?: EthProvider };
  return w.ethereum ?? null;
}

export const hasWallet = (): boolean => injected() !== null;

// The shared chain object and the gen_call transport live in src/genlayer (A-GD-01); this page
// supplies its own RPC and explorer and the injected wallet only for the write.
const testnetBradbury = bradburyChain(presetBradbury, RPC_URL, EXPLORER_BASE);

const readClient = createClient({ chain: testnetBradbury });

export function readView(functionName: string, args: unknown[] = []): Promise<unknown> {
  return genCall(
    readClient as unknown as GenReadClient,
    CONTRACT_ADDRESS,
    functionName,
    args,
    RPC_TIMEOUT_MS,
  );
}

export function readTransaction(hash: string): Promise<unknown> {
  return withTimeout(readClient.getTransaction({ hash: hash as never }), RPC_TIMEOUT_MS);
}

/** Connect the browser wallet, put it on Bradbury (4221) and return the selected account. */
export async function connectWallet(): Promise<Hex> {
  const eth = injected();
  if (!eth) throw new Error('No browser wallet found.');
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
  const account = accounts[0];
  if (typeof account !== 'string') throw new Error('The wallet returned no account.');
  const chainIdHex = `0x${CHAIN_ID.toString(16)}`;
  const current = await eth.request({ method: 'eth_chainId' });
  if (current !== chainIdHex) {
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
    } catch (err) {
      if ((err as { code?: unknown }).code !== 4902) throw err;
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: chainIdHex,
            chainName: testnetBradbury.name,
            rpcUrls: [RPC_URL],
            nativeCurrency: testnetBradbury.nativeCurrency,
            blockExplorerUrls: [EXPLORER_BASE],
          },
        ],
      });
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
    }
  }
  return account as Hex;
}

function writeClient(account: Hex, provider: unknown): WriteClient {
  return createClient({ chain: testnetBradbury, account, provider: provider as never }) as never;
}

/** Ask the node what `attest(receipt_id)` costs. */
export function quoteAttest(account: Hex, receiptId: string): Promise<FeeQuote> {
  return withTimeout(quote(writeClient(account, injected()), receiptId), RPC_TIMEOUT_MS);
}

/** Send `attest(receipt_id)` with the quoted fee; genlayer-js hands the transaction to the browser wallet. */
export function sendAttest(account: Hex, receiptId: string, q: FeeQuote): Promise<string> {
  return send(writeClient(account, injected()), receiptId, q);
}

// A-GD-02: the same read helper, wallet connection and fee procedure for the dispute contracts.
export function readViewAt(
  address: string,
  functionName: string,
  args: unknown[] = [],
): Promise<unknown> {
  return genCall(
    readClient as unknown as GenReadClient,
    address,
    functionName,
    args,
    RPC_TIMEOUT_MS,
  );
}

export function quoteFn(
  account: Hex,
  address: string,
  fn: string,
  args: string[],
): Promise<FeeQuote> {
  return withTimeout(
    quoteCall(writeClient(account, injected()), address, fn, args),
    RPC_TIMEOUT_MS,
  );
}

export function sendFn(
  account: Hex,
  address: string,
  fn: string,
  args: string[],
  q: FeeQuote,
): Promise<string> {
  return sendCall(writeClient(account, injected()), address, fn, args, q);
}
