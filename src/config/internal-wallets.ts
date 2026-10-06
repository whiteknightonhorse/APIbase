import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * T-0280 (TG-POLICY-1006 / MPP-REFUND-DIGEST): our own wallets/bots (MCP Heartbeat).
 * MPP refund-owed rows from these payers are written already processed (not a debt)
 * and tagged payload.internal_wallet=true. Loaded at import, fail-closed like
 * config/autopilot/tg-strings.ru.json: a missing or malformed file throws.
 */
const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

export function parseInternalWallets(raw: string): ReadonlySet<string> {
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('internal-wallets.json must be a JSON array');
  const out = new Set<string>();
  for (const e of data) {
    const entry = e as { address?: unknown; label?: unknown; source?: unknown } | null;
    if (
      typeof entry?.address !== 'string' ||
      !ADDRESS_RE.test(entry.address) ||
      typeof entry.label !== 'string' ||
      typeof entry.source !== 'string'
    ) {
      throw new Error(`internal-wallets.json: bad entry ${JSON.stringify(e)}`);
    }
    out.add(entry.address);
  }
  return out;
}

const INTERNAL_WALLETS = parseInternalWallets(
  readFileSync(resolve(__dirname, '../../config/autopilot/internal-wallets.json'), 'utf-8'),
);

export function isInternalWallet(address: string | null | undefined): boolean {
  return typeof address === 'string' && INTERNAL_WALLETS.has(address.toLowerCase());
}
