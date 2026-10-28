/**
 * A-GA-02: genlayer-js access of the /attest/ page. Reads go straight from the browser to the
 * Bradbury RPC; the write is signed by the visitor's own browser wallet (window.ethereum). The
 * page holds no key and relays nothing.
 */
import { createClient } from 'genlayer-js';
import { testnetBradbury as presetBradbury } from 'genlayer-js/chains';
import { quote, send, type FeeQuote, type WriteClient } from './write';
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

// The 2.0.0-rc.2 preset points at rpc.testnet-chain.genlayer.com, which does not serve gen_call; reads
// need RPC_URL, so the chain object is the preset with this page's RPC and explorer.
const testnetBradbury = {
  ...presetBradbury,
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'GenLayer Scan', url: EXPLORER_BASE } },
};

const readClient = createClient({ chain: testnetBradbury });

/** Reject after RPC_TIMEOUT_MS so a silent network shows a failure state instead of hanging. */
function withTimeout<T>(call: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`The network did not answer within ${RPC_TIMEOUT_MS / 1000} s.`)),
      RPC_TIMEOUT_MS,
    );
    call.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function readView(functionName: string, args: unknown[] = []): Promise<unknown> {
  return withTimeout(
    readClient.readContract({
      address: CONTRACT_ADDRESS as Hex,
      functionName,
      args: args as never,
    }),
  );
}

export function readTransaction(hash: string): Promise<unknown> {
  return withTimeout(readClient.getTransaction({ hash: hash as never }));
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
  return withTimeout(quote(writeClient(account, injected()), receiptId));
}

/** Send `attest(receipt_id)` with the quoted fee; genlayer-js hands the transaction to the browser wallet. */
export function sendAttest(account: Hex, receiptId: string, q: FeeQuote): Promise<string> {
  return send(writeClient(account, injected()), receiptId, q);
}
