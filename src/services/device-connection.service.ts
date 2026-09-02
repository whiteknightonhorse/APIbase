import { randomBytes } from 'node:crypto';
import { getPrisma } from './prisma.service';
import { encryptSecret, decryptSecret } from './secret-crypto.service';
import { config } from '../config';
import { logger } from '../config/logger';

/**
 * Ф5 device-connection storage -- the ONE place a vendor OAuth token touches
 * a database row. Never the vendor password (we never see it -- OAuth
 * authorization-code, cloud-to-cloud), and never plaintext at rest (AES-256-
 * GCM via secret-crypto.service.ts).
 *
 * Ownership is enforced HERE, not trusted from the caller: every read/write
 * below takes the authenticated agentId and filters by it in the SQL WHERE
 * clause, not as an after-the-fact check on a fetched row -- an agent cannot
 * even prove-by-timing that another agent's connection_id exists.
 */

export type ConnectionStatus = 'pending' | 'active' | 'revoked';

export interface DeviceConnectionRow {
  connection_id: string;
  agent_id: string;
  vendor: string;
  vendor_user_id: string | null;
  status: ConnectionStatus;
}

export interface VendorTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds from now until access-token expiry (vendor's `expire_time`). */
  expiresInSec: number;
  vendorUserId?: string;
  scope?: string;
}

function encKey(): string {
  const k = config.ENCRYPTION_KEY;
  if (!k || k.length < 32) {
    throw new Error(
      'ENCRYPTION_KEY is not set (or shorter than 32 chars) -- refusing to store or read a vendor token unencrypted',
    );
  }
  return k;
}

/**
 * Start a connect-webview flow: creates a `pending` row carrying a random
 * CSRF state token. The caller (router) embeds `state` in the redirect to
 * the vendor's authorization page and must see the SAME state echoed back
 * on the callback before ever exchanging a code (OAuth CSRF binding, RFC
 * 6749 §10.12). 10-minute TTL enforced by the caller checking created_at.
 */
export async function createPendingConnection(
  agentId: string,
  vendor: string,
): Promise<{ connectionId: string; state: string }> {
  const state = randomBytes(32).toString('hex');
  const row = await getPrisma().deviceConnection.create({
    data: {
      agent_id: agentId,
      vendor,
      status: 'pending',
      oauth_state: state,
    },
    select: { connection_id: true },
  });
  return { connectionId: row.connection_id, state };
}

const PENDING_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Look up the pending connection a callback's `state` belongs to. Fails
 * closed (returns null) if the state is unknown, already consumed (status
 * != 'pending'), or older than the TTL -- a stale/replayed callback must
 * never activate a connection.
 */
export async function findPendingByState(
  state: string,
): Promise<{ connectionId: string; agentId: string; vendor: string } | null> {
  const row = await getPrisma().deviceConnection.findFirst({
    where: { oauth_state: state, status: 'pending' },
    select: { connection_id: true, agent_id: true, vendor: true, created_at: true },
  });
  if (!row) return null;
  if (Date.now() - row.created_at.getTime() > PENDING_STATE_TTL_MS) {
    logger.warn({ connection_id: row.connection_id }, 'device connect: pending state expired');
    return null;
  }
  return { connectionId: row.connection_id, agentId: row.agent_id, vendor: row.vendor };
}

/**
 * Activate a pending connection with real vendor tokens -- the only place
 * plaintext tokens are encrypted before they touch Postgres. `oauth_state`
 * is cleared on activation so the same state can never be replayed twice.
 */
export async function activateConnection(
  connectionId: string,
  tokens: VendorTokens,
): Promise<void> {
  const key = encKey();
  await getPrisma().deviceConnection.update({
    where: { connection_id: connectionId },
    data: {
      status: 'active',
      vendor_user_id: tokens.vendorUserId ?? null,
      scope: tokens.scope ?? null,
      access_token_enc: encryptSecret(tokens.accessToken, key),
      refresh_token_enc: encryptSecret(tokens.refreshToken, key),
      token_expires_at: new Date(Date.now() + tokens.expiresInSec * 1000),
      oauth_state: null,
    },
  });
}

/** Rotate tokens after a refresh -- Tuya issues a NEW refresh_token every time. */
export async function rotateTokens(connectionId: string, tokens: VendorTokens): Promise<void> {
  const key = encKey();
  await getPrisma().deviceConnection.update({
    where: { connection_id: connectionId },
    data: {
      access_token_enc: encryptSecret(tokens.accessToken, key),
      refresh_token_enc: encryptSecret(tokens.refreshToken, key),
      token_expires_at: new Date(Date.now() + tokens.expiresInSec * 1000),
    },
  });
}

export interface OwnedConnection extends DeviceConnectionRow {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
}

/**
 * Fetch one active connection, scoped to its owner. Returns null (never
 * throws a "found but not yours" distinction) so a probing agent cannot
 * tell "doesn't exist" from "belongs to someone else" apart -- same IDOR
 * defense shape as the rest of this codebase's agent-scoped lookups.
 */
export async function getOwnedConnection(
  agentId: string,
  connectionId: string,
): Promise<OwnedConnection | null> {
  const row = await getPrisma().deviceConnection.findFirst({
    where: { connection_id: connectionId, agent_id: agentId, status: 'active' },
  });
  if (!row || !row.access_token_enc || !row.refresh_token_enc || !row.token_expires_at) {
    return null;
  }
  const key = encKey();
  return {
    connection_id: row.connection_id,
    agent_id: row.agent_id,
    vendor: row.vendor,
    vendor_user_id: row.vendor_user_id,
    status: row.status as ConnectionStatus,
    accessToken: decryptSecret(row.access_token_enc, key),
    refreshToken: decryptSecret(row.refresh_token_enc, key),
    tokenExpiresAt: row.token_expires_at,
  };
}

export async function listActiveConnections(agentId: string): Promise<DeviceConnectionRow[]> {
  const rows = await getPrisma().deviceConnection.findMany({
    where: { agent_id: agentId, status: 'active' },
    select: {
      connection_id: true,
      agent_id: true,
      vendor: true,
      vendor_user_id: true,
      status: true,
    },
  });
  return rows as DeviceConnectionRow[];
}

/**
 * Revoke + WIPE. Sets status='revoked' AND nulls the ciphertext columns in
 * the same UPDATE -- "revoked" alone would leave an encrypted token sitting
 * in the row forever; the operator's brief asks for revocation to remove
 * the credential, not just stop using it. Returns false (not an exception)
 * if the connection doesn't belong to this agent or is already gone, same
 * IDOR-safe shape as getOwnedConnection.
 */
export async function revokeConnection(agentId: string, connectionId: string): Promise<boolean> {
  const result = await getPrisma().deviceConnection.updateMany({
    where: { connection_id: connectionId, agent_id: agentId, status: 'active' },
    data: {
      status: 'revoked',
      access_token_enc: null,
      refresh_token_enc: null,
      token_expires_at: null,
      revoked_at: new Date(),
    },
  });
  return result.count > 0;
}
