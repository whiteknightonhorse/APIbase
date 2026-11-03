import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseAbiItem,
  serializeTransaction,
  encodeFunctionData,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getRefundEnv } from '../config/env';
import { getX402Config } from '../config/x402.config';
import { getMppConfig } from '../config/mpp.config';
import { getOperatorWallet } from '../payments/operator-signer';
import { withOperatorLock } from '../payments/operator-lock';
import { encodeTransferWithAuthorization } from '../payments/local-facilitator';
import { refundSignerKey } from './refund-keys';
import {
  BASE_GAS_UNITS,
  TEMPO_GAS_UNITS,
  baseFeeUsd,
  refundNonce,
  tempoFeeUsd,
} from './refund-math';

export { refundNonce, baseFeeUsd, tempoFeeUsd };
import {
  FeeUnavailableError,
  type ChainStatus,
  type Payout,
  type RailChain,
  type SignResult,
} from './refund-payout.core';

/**
 * T-0553 real chain ports. Base: the refund key signs an EIP-3009 authorization, the existing
 * operator wallet broadcasts it (gas only). Tempo: the refund key signs a token transfer and pays
 * the fee in the same token. X402_OPERATOR_PRIVATE_KEY and TEMPO_PRIVATE_KEY never sign a refund
 * value transfer; only refundSignerKey() material does.
 */

const L1_ORACLE = '0x420000000000000000000000000000000000000F' as const;
const AUTH_TTL_S = 3600;
const RECEIPT_TIMEOUT_MS = 30_000;
const LOG_CHUNK = 9_000n;
const LOG_MAX_CHUNKS = 40;

const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
]);
const authAbi = parseAbi(['function authorizationState(address, bytes32) view returns (bool)']);
const feedAbi = parseAbi([
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
  'function decimals() view returns (uint8)',
]);
const oracleAbi = parseAbi(['function getL1Fee(bytes) view returns (uint256)']);
const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

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

interface BaseAuth {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  signature: string;
}

export function makeBaseChain(refundAddress: string): RailChain {
  const x = getX402Config();
  const operator = getOperatorWallet();
  const pub = operator.signer;
  const usdc = getAddress(x.usdcAddress);
  const chainId = Number(x.network.split(':')[1]);
  const from = getAddress(refundAddress);

  const findTransfer = async (p: Payout): Promise<string | null> => {
    const head = await pub.getBlockNumber();
    const ageS = Math.max(0, (Date.now() - p.created_at.getTime()) / 1000);
    let to = head;
    const floor = head - BigInt(Math.ceil(ageS / 2) + 600);
    for (let i = 0; i < LOG_MAX_CHUNKS && to > floor; i++) {
      const lo = to - LOG_CHUNK > floor ? to - LOG_CHUNK : floor;
      const logs = await pub.getLogs({
        address: usdc,
        event: transferEvent,
        args: { from, to: getAddress(p.payer) },
        fromBlock: lo,
        toBlock: to,
      });
      const hit = logs.find((l) => l.args.value === BigInt(p.micro));
      if (hit?.transactionHash) return hit.transactionHash;
      to = lo - 1n;
    }
    return null;
  };

  return {
    rail: 'base',
    feeFromRefundWallet: false,
    async balanceUsd() {
      const v = await pub.readContract({
        address: usdc,
        abi: erc20,
        functionName: 'balanceOf',
        args: [from],
      });
      return Number(v) / 1e6;
    },
    async feeUsd() {
      try {
        const feedAddr = getAddress(getRefundEnv().REFUND_ETH_USD_FEED);
        const [round, dec] = await Promise.all([
          pub.readContract({ address: feedAddr, abi: feedAbi, functionName: 'latestRoundData' }),
          pub.readContract({ address: feedAddr, abi: feedAbi, functionName: 'decimals' }),
        ]);
        const ethUsd = Number(round[1]) / 10 ** Number(dec);
        const hist = await pub.getFeeHistory({ blockCount: 5, rewardPercentiles: [50] });
        const baseFee = hist.baseFeePerGas[hist.baseFeePerGas.length - 1];
        const rewards = (hist.reward ?? [])
          .map((r) => r[0])
          .filter((v): v is bigint => v !== undefined);
        const priority = rewards.length
          ? rewards.reduce((a, b) => a + b, 0n) / BigInt(rewards.length)
          : 0n;
        const calldata = encodeTransferWithAuthorization(
          {
            from,
            to: from,
            value: 1n,
            validAfter: 0n,
            validBefore: 1n,
            nonce: ('0x' + '00'.repeat(32)) as Hex,
          },
          ('0x' + '11'.repeat(65)) as Hex,
        );
        const serialized = serializeTransaction({
          type: 'eip1559',
          chainId,
          nonce: 0,
          to: usdc,
          data: calldata,
          gas: BASE_GAS_UNITS,
          maxFeePerGas: baseFee + priority,
          maxPriorityFeePerGas: priority,
        });
        const l1 = await pub.readContract({
          address: L1_ORACLE,
          abi: oracleAbi,
          functionName: 'getL1Fee',
          args: [serialized],
        });
        return baseFeeUsd(baseFee, priority, l1, ethUsd);
      } catch (e) {
        if (e instanceof FeeUnavailableError) throw e;
        throw new FeeUnavailableError('base fee inputs unreadable');
      }
    },
    async sign(p): Promise<SignResult> {
      const account = privateKeyToAccount(refundSignerKey('base'));
      if (account.address.toLowerCase() !== from.toLowerCase())
        throw new Error('refund key/address drift');
      const nonce = refundNonce(p.payout_id);
      const validBefore = Math.floor(Date.now() / 1000) + AUTH_TTL_S;
      const message = {
        from,
        to: getAddress(p.payer),
        value: BigInt(p.micro),
        validAfter: 0n,
        validBefore: BigInt(validBefore),
        nonce,
      };
      const signature = await account.signTypedData({
        domain: { name: 'USD Coin', version: '2', chainId, verifyingContract: usdc },
        types: TYPES,
        primaryType: 'TransferWithAuthorization',
        message,
      });
      const auth: BaseAuth = {
        from: message.from,
        to: message.to,
        value: message.value.toString(),
        validAfter: '0',
        validBefore: String(validBefore),
        nonce,
        signature,
      };
      return {
        nonce,
        rawTx: JSON.stringify(auth),
        txHash: null,
        validBefore: new Date(validBefore * 1000),
      };
    },
    async broadcast(p) {
      const a = JSON.parse(p.raw_tx ?? '{}') as BaseAuth;
      const data = encodeTransferWithAuthorization(a, a.signature);
      const res = await withOperatorLock(operator.address, async () => {
        const hash = await pub.sendTransaction({
          to: usdc,
          data,
          account: pub.account,
          chain: pub.chain,
        });
        try {
          const r = await pub.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
          return { txHash: hash as string, success: r.status === 'success' };
        } catch {
          return { txHash: hash as string, success: null };
        }
      });
      return res;
    },
    async status(p): Promise<ChainStatus> {
      if (!p.nonce) return { state: 'unsent' };
      const used = await pub.readContract({
        address: usdc,
        abi: authAbi,
        functionName: 'authorizationState',
        args: [from, p.nonce as Hex],
      });
      if (used) return { state: 'sent', txHash: p.tx_hash ?? (await findTransfer(p)) };
      if (p.valid_before && Date.now() > p.valid_before.getTime()) return { state: 'expired' };
      return { state: 'unsent' };
    },
  };
}

export function makeTempoChain(refundAddress: string): RailChain {
  const m = getMppConfig();
  const chain = defineChain({
    id: m.chainId,
    name: 'Tempo',
    nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
    rpcUrls: { default: { http: [m.rpcUrl] } },
  });
  const pub = createPublicClient({ chain, transport: http(m.rpcUrl, { retryCount: 2 }) });
  const token = getAddress(m.usdcAddress);
  const from = getAddress(refundAddress);

  return {
    rail: 'tempo',
    feeFromRefundWallet: true,
    async balanceUsd() {
      const v = await pub.readContract({
        address: token,
        abi: erc20,
        functionName: 'balanceOf',
        args: [from],
      });
      return Number(v) / 1e6;
    },
    async feeUsd() {
      try {
        return tempoFeeUsd(await pub.getGasPrice());
      } catch {
        throw new FeeUnavailableError('tempo gas price unreadable');
      }
    },
    async sign(p): Promise<SignResult> {
      const account = privateKeyToAccount(refundSignerKey('tempo'));
      if (account.address.toLowerCase() !== from.toLowerCase())
        throw new Error('refund key/address drift');
      const nonce = await pub.getTransactionCount({ address: from, blockTag: 'pending' });
      const gasPrice = await pub.getGasPrice();
      const raw = await account.signTransaction({
        type: 'legacy',
        chainId: m.chainId,
        nonce,
        to: token,
        data: encodeFunctionData({
          abi: erc20,
          functionName: 'transfer',
          args: [getAddress(p.payer), BigInt(p.micro)],
        }),
        gas: TEMPO_GAS_UNITS,
        gasPrice,
      });
      return { nonce: String(nonce), rawTx: raw, txHash: keccak256(raw), validBefore: null };
    },
    async broadcast(p) {
      const raw = p.raw_tx as Hex;
      const hash = keccak256(raw);
      try {
        await pub.sendRawTransaction({ serializedTransaction: raw });
      } catch {
        // already known / nonce used: the receipt below decides.
      }
      try {
        const r = await pub.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
        return { txHash: hash as string, success: r.status === 'success' };
      } catch {
        return { txHash: hash as string, success: null };
      }
    },
    async status(p): Promise<ChainStatus> {
      if (p.tx_hash) {
        try {
          const r = await pub.getTransactionReceipt({ hash: p.tx_hash as Hex });
          return r.status === 'success'
            ? { state: 'sent', txHash: p.tx_hash }
            : { state: 'failed', reason: 'transaction reverted' };
        } catch {
          // no receipt yet
        }
      }
      const next = await pub.getTransactionCount({ address: from, blockTag: 'latest' });
      if (p.nonce !== null && next > Number(p.nonce)) {
        return { state: 'failed', reason: 'account nonce consumed without our transaction' };
      }
      return { state: 'unsent' };
    },
  };
}
