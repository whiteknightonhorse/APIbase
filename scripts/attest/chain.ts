/**
 * A-GA-02: genlayer-js access of the /attest/ page. Reads go straight from the browser to the
 * Bradbury RPC; the write is signed by the visitor's own browser wallet (window.ethereum). The
 * page holds no key and relays nothing.
 */
import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { CHAIN_ID, CONTRACT_ADDRESS, RPC_URL } from './attest-view';

interface EthProvider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

type Hex = `0x${string}`;

function injected(): EthProvider | null {
  const w = window as unknown as { ethereum?: EthProvider };
  return w.ethereum ?? null;
}

export const hasWallet = (): boolean => injected() !== null;

const readClient = createClient({ chain: testnetBradbury });

export function readView(functionName: string, args: unknown[] = []): Promise<unknown> {
  return readClient.readContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName,
    args: args as never,
  });
}

export function readTransaction(hash: string): Promise<unknown> {
  return readClient.getTransaction({ hash: hash as never });
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
            blockExplorerUrls: [testnetBradbury.blockExplorers?.default.url],
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

/** Send `attest(receipt_id)`; genlayer-js hands the transaction to the browser wallet for signing. */
export async function sendAttest(account: Hex, receiptId: string): Promise<string> {
  const client = createClient({ chain: testnetBradbury, account, provider: injected() as never });
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: 'attest',
    args: [receiptId] as never,
    value: 0n,
  });
  return String(hash);
}
