#!/usr/bin/env tsx
/**
 * x402 operator keygen — generate a fresh hot wallet for self-hosted
 * facilitator settles on Base mainnet.
 *
 * Usage:
 *   tsx scripts/x402-operator-keygen.ts
 *
 * Output:
 *   - Address (public, safe to share)
 *   - Private key (printed ONCE to stdout — copy to .env immediately)
 *
 * After running:
 *   1. Add to /home/apibase/apibase/.env:
 *        X402_OPERATOR_PRIVATE_KEY=0x<...>
 *        X402_FACILITATOR_MODE=local       # only after wallet is funded
 *   2. Confirm chmod 600 .env
 *   3. Fund the address with ~$10 of ETH on Base (one-time)
 *   4. docker compose restart api worker
 *   5. Watch `docker logs apibase-api-1 -f | grep "x402 settle"` for tx hashes
 *
 * Security:
 *   - Operator wallet holds ONLY ETH for gas, NEVER USDC. The receiver
 *     X402_PAYMENT_ADDRESS is a separate address. Loss of operator key
 *     = loss of unspent gas, NOT customer funds.
 *   - Never commit the key, never log it, never put it in shell history
 *     (use copy-paste from this terminal output, not echo into files).
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

function main(): void {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  // eslint-disable-next-line no-console
  console.log(`
================================================================
  x402 OPERATOR WALLET — generated ${new Date().toISOString()}
================================================================

  Address (public — share freely, fund this on Base):
    ${account.address}

  Private key (SECRET — copy to .env now, then clear scrollback):
    ${privateKey}

----------------------------------------------------------------
  Next steps:

  1. Append to /home/apibase/apibase/.env:
       X402_OPERATOR_PRIVATE_KEY=${privateKey}
     (do NOT flip X402_FACILITATOR_MODE=local until step 3 done)

  2. Confirm:
       chmod 600 /home/apibase/apibase/.env
       grep -E '^X402_OPERATOR' /home/apibase/apibase/.env

  3. Fund this address with ~\$10 of ETH on Base mainnet
     (any exchange withdrawal supporting Base, e.g. Coinbase/Binance):
       ${account.address}
     Verify on https://basescan.org/address/${account.address}

  4. Flip the flag and restart:
       sed -i 's/^X402_FACILITATOR_MODE=remote/X402_FACILITATOR_MODE=local/' /home/apibase/apibase/.env
       docker compose -f /home/apibase/apibase/docker-compose.yml restart api worker

  5. Watch settles land on-chain:
       docker logs apibase-api-1 -f | grep -E 'x402 settle|x402: payment settled'

  6. Now safe to clear this terminal:
       history -c && clear
================================================================
`);
}

main();
