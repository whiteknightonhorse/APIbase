/**
 * Ф5 full T1 scenario, proven end to end against an IN-MEMORY Prisma fake +
 * a MOCKED Tuya HTTP server: connect (webview start -> callback) -> list ->
 * state -> command (safety-gated) -> revoke.
 *
 * ⚠️ Disclosed scope: this proves the MECHANISM (ownership, encryption,
 * CSRF-state binding, safety gate, cache bypass, log hygiene) end to end.
 * It does NOT prove a live round-trip against the real Tuya cloud or a real
 * Postgres -- that requires TUYA_CLIENT_ID/SECRET the operator has not yet
 * provisioned (docs/OPERATOR-ACTION-device-vendor-tuya.md) and is not
 * something this test claims. See tuya-client.test.ts for the same
 * disclosure on the HTTP-shape level.
 */

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// In-memory Prisma fake -- just enough of the deviceConnection model surface
// that device-connection.service.ts calls.
// ---------------------------------------------------------------------------
interface FakeRow {
  connection_id: string;
  agent_id: string;
  vendor: string;
  vendor_user_id: string | null;
  status: string;
  scope: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: Date | null;
  oauth_state: string | null;
  created_at: Date;
  revoked_at: Date | null;
}

const store = new Map<string, FakeRow>();

const fakePrisma = {
  deviceConnection: {
    create: jest.fn(async ({ data }: { data: Partial<FakeRow> }) => {
      const row: FakeRow = {
        connection_id: randomUUID(),
        agent_id: data.agent_id as string,
        vendor: data.vendor as string,
        vendor_user_id: null,
        status: (data.status as string) ?? 'pending',
        scope: null,
        access_token_enc: null,
        refresh_token_enc: null,
        token_expires_at: null,
        oauth_state: (data.oauth_state as string) ?? null,
        created_at: new Date(),
        revoked_at: null,
      };
      store.set(row.connection_id, row);
      return { connection_id: row.connection_id };
    }),
    update: jest.fn(
      async ({ where, data }: { where: { connection_id: string }; data: Partial<FakeRow> }) => {
        const row = store.get(where.connection_id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      },
    ),
    findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      for (const row of store.values()) {
        let match = true;
        for (const [k, v] of Object.entries(where)) {
          if ((row as unknown as Record<string, unknown>)[k] !== v) match = false;
        }
        if (match) return { ...row };
      }
      return null;
    }),
    findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const out: FakeRow[] = [];
      for (const row of store.values()) {
        let match = true;
        for (const [k, v] of Object.entries(where)) {
          if ((row as unknown as Record<string, unknown>)[k] !== v) match = false;
        }
        if (match) out.push({ ...row });
      }
      return out;
    }),
    updateMany: jest.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: Partial<FakeRow> }) => {
        let count = 0;
        for (const row of store.values()) {
          let match = true;
          for (const [k, v] of Object.entries(where)) {
            if ((row as unknown as Record<string, unknown>)[k] !== v) match = false;
          }
          if (match) {
            Object.assign(row, data);
            count++;
          }
        }
        return { count };
      },
    ),
  },
};

jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => fakePrisma,
}));

jest.mock('../../src/config', () => ({
  config: {
    ENCRYPTION_KEY: 'a'.repeat(32),
    TUYA_CLIENT_ID: 'test_client_id',
    TUYA_CLIENT_SECRET: 'test_client_secret',
    TUYA_API_BASE_URL: 'https://mock-tuya.example.com',
    TUYA_AUTHORIZE_URL: 'https://mock-tuya.example.com/authorize',
  },
}));

import {
  createPendingConnection,
  findPendingByState,
  activateConnection,
  getOwnedConnection,
  revokeConnection,
} from '../../src/services/device-connection.service';
import { DeviceAdapter } from '../../src/adapters/device-tuya';
import { logger } from '../../src/config/logger';

const REAL_ACCESS_TOKEN = 'REAL-tuya-access-token-should-never-appear-in-logs';
const REAL_REFRESH_TOKEN = 'REAL-tuya-refresh-token-should-never-appear-in-logs';

function mockJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Ф5 device connect -> state -> command -> revoke (full T1 scenario)', () => {
  const agentId = randomUUID();
  const originalFetch = globalThis.fetch;
  const logLines: string[] = [];

  const originalLevel = logger.level;

  beforeAll(() => {
    // NODE_ENV=test sets the logger to 'silent' (logger.ts), which would
    // make a "no plaintext in logs" check trivially pass by logging
    // NOTHING at all -- a fake-green test. Force a real level so this test
    // actually exercises pino's write path (which writes to
    // process.stdout, see logger.ts's truncatingStream) before capturing
    // it -- this is the "grep the logs" requirement from the operator's
    // brief, run as an automated check against REAL log output, not a
    // check that silence looks clean.
    logger.level = 'debug';
    // F7: the mock MUST invoke the write callback -- truncatingStream (logger.ts) calls
    // `process.stdout.write(line, callback)` and waits for it before its own _write()
    // completes. A mock that swallows the callback (this test's original shape) stalls
    // the Writable's internal queue after the very first log line: every subsequent
    // logger call in this whole file is silently buffered and never reaches the mock
    // again, which would make the FINAL CHECK below pass on an empty/truncated
    // `logLines`, not on the real accumulated logs.
    jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown, encodingOrCb?: unknown, cb?: unknown) => {
        logLines.push(String(chunk));
        const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
        if (typeof callback === 'function') callback();
        return true;
      });
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    logger.level = originalLevel;
    jest.restoreAllMocks();
  });

  let connectionId: string;
  let state: string;

  it('step 1: connect-webview start creates a pending connection with a random state', async () => {
    const pending = await createPendingConnection(agentId, 'tuya');
    connectionId = pending.connectionId;
    state = pending.state;
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    expect(connectionId).toBeTruthy();
  });

  it('step 2: callback exchanges code for tokens ONLY when state matches (CSRF binding)', async () => {
    expect(await findPendingByState('wrong-state-guess')).toBeNull();

    const found = await findPendingByState(state);
    expect(found?.connectionId).toBe(connectionId);
    expect(found?.agentId).toBe(agentId);

    globalThis.fetch = jest.fn().mockResolvedValue(
      mockJson({
        success: true,
        result: {
          access_token: REAL_ACCESS_TOKEN,
          refresh_token: REAL_REFRESH_TOKEN,
          expire_time: 7200,
          uid: 'tuya-uid-1',
        },
      }),
    );

    // F3 fix: the router (and now this test, to match) goes through the
    // same pipeline-stage seam PROVIDER_CALL uses, not a bare adapter import.
    const { exchangeTuyaCode } = await import('../../src/pipeline/stages/device-oauth.stage');
    const tokens = await exchangeTuyaCode(
      {
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
        apiBaseUrl: 'https://mock-tuya.example.com',
      },
      'auth-code-from-tuya-redirect',
    );
    await activateConnection(connectionId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSec: tokens.expireTimeSec,
      vendorUserId: tokens.uid,
    });

    // the SAME state can never be replayed once consumed
    expect(await findPendingByState(state)).toBeNull();
  });

  it('tokens are stored ENCRYPTED, never as a plaintext substring in the fake DB row', async () => {
    const raw = store.get(connectionId)!;
    expect(raw.access_token_enc).not.toContain(REAL_ACCESS_TOKEN);
    expect(raw.refresh_token_enc).not.toContain(REAL_REFRESH_TOKEN);
    expect(raw.status).toBe('active');
  });

  it('step 3: getOwnedConnection decrypts correctly for the owning agent only', async () => {
    const owned = await getOwnedConnection(agentId, connectionId);
    expect(owned?.accessToken).toBe(REAL_ACCESS_TOKEN);

    const strangerAgentId = randomUUID();
    expect(await getOwnedConnection(strangerAgentId, connectionId)).toBeNull();
  });

  it('step 4: device.state reads through the adapter with the owning agent', async () => {
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/commands')) {
        return Promise.resolve(mockJson({ success: true, result: true }));
      }
      if (u.includes('/status')) {
        return Promise.resolve(
          mockJson({ success: true, result: [{ code: 'temp_current', value: 24 }] }),
        );
      }
      if (u.includes('/users/')) {
        return Promise.resolve(
          mockJson({
            success: true,
            result: [{ id: 'ac-device-1', name: 'Living room AC', category: 'kt', online: true }],
          }),
        );
      }
      return Promise.resolve(mockJson({ success: true, result: true }));
    });

    const adapter = new DeviceAdapter();
    const raw = await adapter.call({
      toolId: 'device.state',
      params: { connection_id: connectionId, device_id: 'ac-device-1' },
      requestId: 'req-state-1',
      agentId,
    });
    expect(raw.status).toBe(200);
    expect(raw.body).toEqual([{ code: 'temp_current', value: 24 }]);
  });

  it('step 5a: device.command respects the configured temperature bound (fail closed)', async () => {
    const adapter = new DeviceAdapter();
    await expect(
      adapter.call({
        toolId: 'device.command',
        params: {
          connection_id: connectionId,
          device_id: 'ac-device-1',
          command: 'temp_set',
          value: 99,
        },
        requestId: 'req-cmd-bad',
        agentId,
      }),
    ).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('step 5b: device.command succeeds with an in-bounds value', async () => {
    const adapter = new DeviceAdapter();
    const raw = await adapter.call({
      toolId: 'device.command',
      params: {
        connection_id: connectionId,
        device_id: 'ac-device-1',
        command: 'temp_set',
        value: 22,
      },
      requestId: 'req-cmd-ok',
      agentId,
    });
    expect(raw.status).toBe(200);
    expect(raw.body).toEqual({ success: true });
  });

  it('a stranger agent cannot address this connection at all (IDOR check)', async () => {
    const adapter = new DeviceAdapter();
    const strangerAgentId = randomUUID();
    await expect(
      adapter.call({
        toolId: 'device.state',
        params: { connection_id: connectionId, device_id: 'ac-device-1' },
        requestId: 'req-idor',
        agentId: strangerAgentId,
      }),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('step 6: revoke wipes the ciphertext columns, not just the status flag', async () => {
    const revoked = await revokeConnection(agentId, connectionId);
    expect(revoked).toBe(true);
    const raw = store.get(connectionId)!;
    expect(raw.status).toBe('revoked');
    expect(raw.access_token_enc).toBeNull();
    expect(raw.refresh_token_enc).toBeNull();
    expect(await getOwnedConnection(agentId, connectionId)).toBeNull();
  });

  it('revoking again is a clean false, not an error (idempotent-safe)', async () => {
    expect(await revokeConnection(agentId, connectionId)).toBe(false);
  });

  it('FINAL CHECK: neither real token ever appears in captured log output', () => {
    const allLogs = logLines.join('\n');
    expect(allLogs).not.toContain(REAL_ACCESS_TOKEN);
    expect(allLogs).not.toContain(REAL_REFRESH_TOKEN);
  });
});
