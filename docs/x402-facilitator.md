# Self-Hosted x402 Facilitator

> APIbase settles every x402 USDC payment on Base mainnet directly, without depending on a third-party HTTP facilitator service. This document explains why, how, and how to reproduce the pattern in your own service.

## Why self-host

The [x402 protocol](https://github.com/coinbase/x402) defines a peer-to-peer payment standard between an AI agent (payer) and a service (merchant). The agent signs an [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009) `transferWithAuthorization` permit; somebody — the **facilitator** — submits that signed permit on-chain to actually move USDC.

Most x402 services delegate the facilitator role to a SaaS provider:

- **CDP (Coinbase)** — official, free tier with monthly cap, then paid + KYC required.
- **PayAI** — open community facilitator, no SLA.
- **x402.org** — official spec ref impl, testnet-leaning.

This works until it doesn't:

- Free tier exhausts and KYC fails — service stops settling.
- Facilitator changes pricing or restricts a region — service can't respond.
- Facilitator has an outage — paid endpoints return 502s during incident window.

For a payment-dependent service running 24/7, this is single-vendor risk on the most critical revenue path.

**Self-hosting eliminates the dependency.** APIbase signs and submits the on-chain settle itself, the same way any normal Base wallet would. No third party can pause, throttle, or de-platform our payment flow.

## How it works

```
Agent
  │ X-Payment header (EIP-3009 signature)
  ▼
APIbase API ──► 13-stage pipeline ──► escrow-finalize.stage.ts
                                              │
                                              ▼
                            ┌──────────────────────────────┐
                            │  LocalFacilitatorClient      │
                            │  (src/payments/              │
                            │   local-facilitator.ts)      │
                            │                              │
                            │  · Redis SETNX lock          │
                            │  · prom metrics              │
                            │  · PayAI HTTP fallback       │
                            └──────────────┬───────────────┘
                                           │
                                           ▼
                       ┌────────────────────────────────────┐
                       │  in-process x402Facilitator (SDK)  │
                       │  + registerExactEvmScheme(signer)  │
                       │  EIP-3009 verify + settle          │
                       └──────────────┬─────────────────────┘
                                      │ submits tx
                                      ▼
                       ┌────────────────────────────────────┐
                       │  Operator wallet (viem)            │
                       │  Base mainnet, ETH for gas only    │
                       └──────────────┬─────────────────────┘
                                      │ transferWithAuthorization
                                      ▼
                                  USDC on Base
```

### Key building blocks

The implementation is a **thin glue layer** — about 350 lines of TypeScript total — built entirely on public SDKs:

| Library | Role |
|---|---|
| [`@x402/core/facilitator`](https://www.npmjs.com/package/@x402/core) | `x402Facilitator` orchestrator + `FacilitatorClient` interface |
| [`@x402/evm/exact/facilitator`](https://www.npmjs.com/package/@x402/evm) | EIP-3009 verify + settle implementation for EVM chains |
| [`viem`](https://viem.sh) | `WalletClient` + `publicActions` — the on-chain signer |
| `ioredis` | SETNX lock for cross-container nonce serialization |
| `prom-client` | Settle latency / outcome / lock-wait metrics |

### Code map

| File | What it does |
|---|---|
| [`src/payments/local-facilitator.ts`](../src/payments/local-facilitator.ts) | `LocalFacilitatorClient implements FacilitatorClient`. Wraps `x402Facilitator`. Adds Redis lock around `settle()` + transparent PayAI HTTP fallback on throw. |
| [`src/payments/operator-signer.ts`](../src/payments/operator-signer.ts) | Builds the viem `WalletClient + publicActions` from the operator private key. Singleton. Never logs the key. |
| [`src/payments/operator-lock.ts`](../src/payments/operator-lock.ts) | `withOperatorLock(address, fn)` — Redis SETNX lock, TTL 60s, retry 100ms × 30s. Lua atomic compare-and-delete on release. |
| [`src/services/x402-server.service.ts`](../src/services/x402-server.service.ts) | Wires the local client into `x402ResourceServer` based on `X402_FACILITATOR_MODE` flag. |
| [`scripts/x402-operator-keygen.ts`](../scripts/x402-operator-keygen.ts) | One-shot CLI to generate the operator wallet. |

## Operational design

### Two distinct wallets

| Role | Holds | Purpose |
|---|---|---|
| **Receiver** (`X402_PAYMENT_ADDRESS`) | USDC inflow (revenue) | Public payTo address. Just an address — no private key in env. |
| **Operator** (`X402_OPERATOR_PRIVATE_KEY`) | ETH for gas only | Hot wallet that signs and submits `transferWithAuthorization`. Never holds USDC. |

The wallets are **strictly separate**. Compromise of the operator key means loss of unspent gas (~$10 cushion), not loss of customer USDC funds.

### Concurrency

`viem`'s nonce manager is per-process. With multiple containers (api + worker) potentially submitting on the same operator wallet, two concurrent `eth_getTransactionCount` calls would return the same nonce → second tx fails "nonce too low".

Solution: **Redis SETNX lock per operator address**, TTL 60s. Settle calls serialize through the lock; verify is read-only and not locked. At 100K settles/month (~140/h, settle ~1-3s on Base) the one-inflight-at-a-time ceiling has comfortable headroom. Lock acquisition is observable via `x402_operator_lock_wait_seconds` histogram.

### Failover

The SDK's `x402ResourceServer` does **not** iterate fallback clients automatically — it picks the first client that supports the `(version, network, scheme)` tuple. So our `LocalFacilitatorClient` does its own internal fallback: if local verify or settle throws, it delegates to a `HTTPFacilitatorClient` pointed at PayAI. This catches transient RPC outages without exposing fallback complexity to the SDK consumer.

### Cost

| Component | Cost per settle |
|---|---|
| Base mainnet gas | ~$0.0005 (varies with fee market) |
| Third-party facilitator fee | $0 (we don't use one) |
| **Total** | **~$0.0005** |

Per 100K settles/month: **~$50 in gas total** vs. unbounded SaaS pricing tiers.

### Observability

| Metric | Type | Labels | What it tells you |
|---|---|---|---|
| `x402_local_settle_total` | Counter | `result` ∈ {success, error, fallback} | Throughput + outcome distribution |
| `x402_local_settle_duration_seconds` | Histogram | `result` | Settle latency by outcome |
| `x402_operator_eth_balance` | Gauge | — | Operator wallet ETH (top-up alert at 0.005) |
| `x402_operator_lock_wait_seconds` | Histogram | — | Lock contention — early warning before request timeouts |

Alerts in `prometheus/rules/alerts.yml`:

- `X402OperatorWalletLowBalance` (critical) — fires at <0.005 ETH for 5 min.
- `X402LocalSettleErrorRate` (warning) — fires at error rate >5% over 10 min.

## Reproducing the pattern

If you run an x402-priced API and want to remove your third-party facilitator dependency, the pattern is:

1. **Generate an operator wallet.** Any tool that produces a `0x...` private key works (we use [`generatePrivateKey`](https://viem.sh/docs/accounts/local/generatePrivateKey) from `viem/accounts`). See [`scripts/x402-operator-keygen.ts`](../scripts/x402-operator-keygen.ts) for an example with proper key-handling banner.

2. **Fund the operator with ETH on Base.** Just enough for gas (~$10 buys ~10K-20K settles).

3. **Build the local facilitator.**

   ```typescript
   import { x402Facilitator } from '@x402/core/facilitator';
   import { registerExactEvmScheme } from '@x402/evm/exact/facilitator';
   import { createWalletClient, http, publicActions } from 'viem';
   import { privateKeyToAccount } from 'viem/accounts';
   import { base } from 'viem/chains';

   const account = privateKeyToAccount(operatorPrivateKey);
   const signer = createWalletClient({
     account,
     chain: base,
     transport: http(rpcUrl, { retryCount: 2, retryDelay: 200 }),
   }).extend(publicActions);

   const facilitator = new x402Facilitator();
   registerExactEvmScheme(facilitator, {
     signer,
     networks: 'eip155:8453',
   });
   ```

4. **Wrap as a `FacilitatorClient`** and pass to `x402ResourceServer`. See [`src/payments/local-facilitator.ts`](../src/payments/local-facilitator.ts) for a complete reference implementation including the Redis lock, fallback, and metrics.

5. **Add a low-balance Prometheus alert.** Hot wallets must be monitored.

That's the whole thing.

## Security posture

- Operator key lives only in `.env` (chmod 600, `.gitignore`-d). Never logged, never echoed to stdout/`ps`. Loaded into memory once at startup, scoped to the WalletClient closure.
- Operator wallet **never** holds USDC. If the key is compromised, attacker gets unspent gas (small dollar amount). Customer USDC is on the receiver wallet which has no private key in the runtime environment at all.
- Operator key rotation: generate new key, drain remaining ETH from old → new, swap value in `.env`, restart api+worker.
- Public RPC (`https://mainnet.base.org`) has no SLA. For higher reliability, swap `X402_BASE_RPC_URL` to a private RPC (Alchemy, QuickNode, etc.). Configurable per-environment without redeploy.

## Status

This document describes a production system. Live since 2026-05-01 on `apibase.pro`, settling every x402 payment on Base mainnet. The architecture is open-source under the same license as the rest of the repository — fork freely.

If you build something similar, we'd be glad to hear about it. Open an issue or discussion on the repository.
