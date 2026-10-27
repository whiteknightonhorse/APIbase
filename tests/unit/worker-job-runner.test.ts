const executeRaw = jest.fn();
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({ $executeRaw: executeRaw, $queryRaw: jest.fn() })),
}));
const logInfo = jest.fn();
const logWarn = jest.fn();
const logError = jest.fn();
jest.mock('../../src/config/logger', () => ({
  logger: { info: logInfo, warn: logWarn, error: logError },
}));
let tick: () => void;
jest.mock('node-cron', () => ({
  __esModule: true,
  default: {
    schedule: jest.fn((_expr: string, fn: () => void) => {
      tick = fn;
      return { stop: jest.fn() };
    }),
  },
}));

import { registerJob, registeredJobs, workerStartedMessage } from '../../src/worker/job-runner';

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
// T-0586: registerJob writes the startup row first; drop that call so run-count assertions stay about runs.
const registered = async () => {
  await flush();
  executeRaw.mockClear();
};
// $executeRaw is a tagged template: args are (strings, ...values)
const valuesOf = (call: unknown[]) => call.slice(1);

beforeEach(() => {
  jest.clearAllMocks();
  executeRaw.mockResolvedValue(1);
});

describe('worker job runner', () => {
  it('J1: success -> start upsert + finish upsert with report, one info line', async () => {
    registerJob({
      name: 'j1',
      cron: '* * * * *',
      expect_every_s: 60,
      run: async () => ({ swept: 3 }),
    });
    await registered();
    tick();
    await flush();
    expect(executeRaw).toHaveBeenCalledTimes(2);
    const finish = valuesOf(executeRaw.mock.calls[1]);
    expect(finish).toEqual(['j1', 60, true, JSON.stringify({ swept: 3 }), null]);
    expect(String((executeRaw.mock.calls[1][0] as string[]).join('?'))).toContain('runs_total + 1');
    const lines = logInfo.mock.calls.filter((c) => c[1] === 'job run');
    expect(lines).toHaveLength(1);
    expect(lines[0][0]).toMatchObject({ job: 'j1', ok: true, swept: 3 });
  });

  it('J2: throwing run -> last_ok=false, error, next tick runs again', async () => {
    const run = jest.fn().mockRejectedValue(new Error('x'.repeat(600)));
    registerJob({ name: 'j2', cron: '* * * * *', expect_every_s: 60, run });
    await registered();
    tick();
    await flush();
    const finish = valuesOf(executeRaw.mock.calls[1]);
    expect(finish[2]).toBe(false);
    expect((finish[4] as string).length).toBe(500);
    expect(logError).toHaveBeenCalled();
    tick();
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('J3: tick during an unfinished run is skipped', async () => {
    let release: () => void = () => {};
    const run = jest.fn(() => new Promise<void>((r) => (release = r)));
    registerJob({ name: 'j3', cron: '* * * * *', expect_every_s: 60, run });
    await registered();
    tick();
    await flush();
    tick();
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    release();
    await flush();
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it('J4: upsert failure -> run still called, warn logged', async () => {
    executeRaw.mockRejectedValue(new Error('db down'));
    const run = jest.fn().mockResolvedValue(undefined);
    registerJob({ name: 'j4', cron: '* * * * *', expect_every_s: 60, run });
    tick();
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    expect(logWarn.mock.calls.filter((c) => c[1] === 'job run record failed').length).toBe(3);
  });

  it('J6: a hung run is abandoned after timeout_ms and the next tick runs again', async () => {
    jest.useFakeTimers();
    try {
      const run = jest.fn(() => new Promise<void>(() => {}));
      registerJob({ name: 'j6', cron: '* * * * *', expect_every_s: 60, timeout_ms: 1000, run });
      tick();
      await flush();
      tick();
      await flush();
      expect(run).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1000);
      await flush();
      expect(logError.mock.calls.some((c) => String(c[1]).includes('job timed out'))).toBe(true);
      const finish = valuesOf(executeRaw.mock.calls[executeRaw.mock.calls.length - 1]);
      expect(finish[2]).toBe(false);
      expect(String(finish[4])).toContain('timed out');
      tick();
      await flush();
      expect(run).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('J7: registration writes the row at startup with no run columns, before any tick (T-0586)', async () => {
    registerJob({ name: 'j7', cron: '10 3 1 * *', expect_every_s: 2678400, run: async () => ({}) });
    await flush();
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = executeRaw.mock.calls[0] as [string[], ...unknown[]];
    expect(values).toEqual(['j7', 2678400]);
    const sql = strings.join('?');
    expect(sql).toContain('INSERT INTO worker_job_runs (job, expect_every_s)');
    expect(sql).not.toContain('last_started_at');
  });

  it('J5: started message lists every registered job', () => {
    const msg = workerStartedMessage();
    for (const n of registeredJobs()) expect(msg).toContain(n);
    expect(registeredJobs()).toEqual(expect.arrayContaining(['j1', 'j2', 'j3', 'j4']));
    expect(msg).toContain('legacy: heartbeat');
  });
});
