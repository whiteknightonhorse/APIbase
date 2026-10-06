/**
 * T-INT-40 step 0 — probe of the TIP-1034 payee restriction on the Tempo TESTNET (chain 42431,
 * rpc.moderato.tempo.xyz). The dispatcher runs it; the task only ships the script.
 *
 *   npx ts-node scripts/shop/probe-tip1034-payee.ts --testnet
 *
 * Needs three testnet accounts with pathUSD for gas and the deposit (faucet), passed in the
 * environment (never on the command line, never committed):
 *   PROBE_PAYER_KEY   the channel payer (opens the channel, signs the voucher)
 *   PROBE_PAYEE_KEY   account A: the channel payee
 *   PROBE_OTHER_KEY   account B (B != A): must NOT be able to settle
 *
 * What it does: opens a channel with payee = A, then tries `settle` from B (expected: revert
 * NotPayee), then `settle` from A (expected: success). It also reads CLOSE_GRACE_PERIOD from the
 * escrow, the only number the /integrator/buyers page may quote about the payer's withdrawal wait.
 *
 * Result (one JSON object on stdout) goes into the task report and the knowledge entry:
 *   payee_restriction: "PRESENT"  -> NotPayee seen for B, A settled      (expected)
 *   payee_restriction: "ABSENT"   -> B's settle was accepted: record "payee-restriction ABSENT";
 *                                    the INT-46 `merchant` mode gets simpler (separate ruling),
 *                                    this card's code does not change.
 *   payee_restriction: "UNKNOWN"  -> neither outcome was clean (see `notes`).
 */
import { randomBytes } from 'node:crypto';

const TESTNET_CHAIN_ID = 42431;
const RPC_URL = 'https://rpc.moderato.tempo.xyz';
const PATH_USD = '0x20c0000000000000000000000000000000000000';
const ESCROW = '0xe1c4d3dce17bc111181ddf716f75bae49e61a336';
const DEPOSIT = 100_000n; // $0.10
const VOUCHER = 10_000n; // $0.01

const need = (name: string): `0x${string}` => {
  const v = process.env[name];
  if (!v || !/^0x[0-9a-fA-F]{64}$/.test(v))
    throw new Error(`${name} must be a 0x-prefixed 32-byte hex key`);
  return v as `0x${string}`;
};

async function main(): Promise<void> {
  if (!process.argv.includes('--testnet')) throw new Error('refusing to run without --testnet');
  const { createClient, http, erc20Abi, toHex } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { tempoModerato } = await import('viem/chains');
  const { readContract, writeContract, waitForTransactionReceipt } = await import('viem/actions');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Session } = (await import('mppx/tempo')) as any;
  if (tempoModerato.id !== TESTNET_CHAIN_ID) throw new Error('unexpected testnet chain id');

  const payer = privateKeyToAccount(need('PROBE_PAYER_KEY'));
  const a = privateKeyToAccount(need('PROBE_PAYEE_KEY'));
  const b = privateKeyToAccount(need('PROBE_OTHER_KEY'));
  if (a.address.toLowerCase() === b.address.toLowerCase()) throw new Error('A and B must differ');
  const client = createClient({ chain: tempoModerato, transport: http(RPC_URL) });
  const abi = Session.Chain.escrowAbi;
  const notes: string[] = [];

  const salt = toHex(randomBytes(32));
  const channelId = Session.Channel.computeId({
    authorizedSigner: payer.address,
    chainId: TESTNET_CHAIN_ID,
    escrowContract: ESCROW,
    payee: a.address,
    payer: payer.address,
    salt,
    token: PATH_USD,
  });

  // 1. the payer opens the channel with payee = A
  const approveTx = await writeContract(client, {
    account: payer,
    chain: tempoModerato,
    address: PATH_USD,
    abi: erc20Abi,
    functionName: 'approve',
    args: [ESCROW, DEPOSIT],
  } as never);
  await waitForTransactionReceipt(client, { hash: approveTx });
  const openTx = await writeContract(client, {
    account: payer,
    chain: tempoModerato,
    address: ESCROW,
    abi,
    functionName: 'open',
    args: [a.address, PATH_USD, DEPOSIT, salt, payer.address],
  } as never);
  await waitForTransactionReceipt(client, { hash: openTx });

  // 2. the payer signs a voucher for $0.01 (mppx's own EIP-712 voucher domain)
  const signature = (await Session.Voucher.signVoucher(
    client,
    payer,
    { channelId, cumulativeAmount: VOUCHER },
    ESCROW,
    TESTNET_CHAIN_ID,
  )) as `0x${string}`;

  const settleFrom = async (account: typeof a) => {
    try {
      const hash = await writeContract(client, {
        account,
        chain: tempoModerato,
        address: ESCROW,
        abi,
        functionName: 'settle',
        args: [channelId, VOUCHER, signature],
      } as never);
      await waitForTransactionReceipt(client, { hash });
      return { ok: true as const, hash };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  };

  // 3. B must be refused (NotPayee), then A must succeed
  const fromB = await settleFrom(b);
  const fromA = await settleFrom(a);
  const notPayee = !fromB.ok && /NotPayee/i.test(fromB.error);

  let closeGrace: string | null = null;
  try {
    closeGrace = String(
      await readContract(client, {
        address: ESCROW,
        abi,
        functionName: 'CLOSE_GRACE_PERIOD',
      } as never),
    );
  } catch (err) {
    notes.push(
      `CLOSE_GRACE_PERIOD read failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const payee_restriction = notPayee && fromA.ok ? 'PRESENT' : fromB.ok ? 'ABSENT' : 'UNKNOWN';
  console.log(
    JSON.stringify(
      {
        chain_id: TESTNET_CHAIN_ID,
        channel_id: channelId,
        payee: a.address,
        other: b.address,
        payee_restriction,
        settle_from_other: fromB,
        settle_from_payee: fromA,
        close_grace_period_s: closeGrace,
        notes,
      },
      null,
      2,
    ),
  );
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
