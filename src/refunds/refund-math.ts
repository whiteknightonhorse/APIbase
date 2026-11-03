import { keccak256, toBytes, type Hex } from 'viem';
import { FeeUnavailableError } from './refund-payout.core';

/** Pure refund math: no config, no network. */

/** Chainlink sanity band for ETH/USD; outside it (or unreadable) the Base run is skipped. */
const ETH_USD_MIN = 500;
const ETH_USD_MAX = 20_000;
export const BASE_GAS_UNITS = 80_000n;
export const TEMPO_GAS_UNITS = 60_000n;

export function refundNonce(payoutId: string): Hex {
  return keccak256(toBytes('apibase-refund:' + payoutId));
}

/** Pure fee math for Base: (baseFee + priority) * gas + L1 fee, converted to USD. */
export function baseFeeUsd(
  baseFeeWei: bigint,
  priorityWei: bigint,
  l1FeeWei: bigint,
  ethUsd: number,
): number {
  if (!(ethUsd >= ETH_USD_MIN && ethUsd <= ETH_USD_MAX)) {
    throw new FeeUnavailableError(`ETH/USD ${ethUsd} outside the sanity band`);
  }
  const wei = (baseFeeWei + priorityWei) * BASE_GAS_UNITS + l1FeeWei;
  return (Number(wei) / 1e18) * ethUsd;
}

/** Pure fee math for Tempo: gas price is in attodollars per gas. */
export function tempoFeeUsd(gasPriceAtto: bigint): number {
  return Number(gasPriceAtto * TEMPO_GAS_UNITS) / 1e18;
}
