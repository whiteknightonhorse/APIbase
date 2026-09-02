/**
 * F7 gate: which field names actually get redacted before a pino write.
 *
 * check-device-no-plaintext-secrets.sh already proves this against real container logs
 * for the device-connect flow specifically, as a manual/compensating check. This is the
 * general, always-run version: every sensitive-looking key name the redactor is SUPPOSED
 * to cover, checked once, in CI, on every run -- not just after someone remembers to grep
 * a live container.
 *
 * Before this fix, only api_key/apikey/authorization/email/provider_key were masked;
 * access_token, refresh_token, client_secret, password, and secret went out in plaintext.
 */
import { logger } from '../../src/config/logger';

describe('logger redaction (F7)', () => {
  const originalLevel = logger.level;
  let logLines: string[] = [];
  let writeSpy: jest.SpyInstance;

  beforeAll(() => {
    // NODE_ENV=test sets the logger to 'silent' -- force a real level so this test
    // exercises pino's actual write path instead of trivially passing on silence.
    logger.level = 'debug';
  });

  beforeEach(() => {
    logLines = [];
    // The mock MUST invoke the write callback: logger.ts's truncatingStream calls
    // `process.stdout.write(line, callback)` and waits for that callback before it
    // considers its own _write() done. A mock that swallows the callback (the shape this
    // repo's other log-capture test used) stalls the Writable's internal queue after the
    // very first call -- every log line after that is silently buffered and never reaches
    // this mock again, and the "no plaintext" assertions below would pass on empty
    // content, not on real captured logs. Confirmed by running this test WITH that bug:
    // every full-redact case failed on an empty `written` string, not a real one.
    writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown, encodingOrCb?: unknown, cb?: unknown) => {
        logLines.push(String(chunk));
        const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
        if (typeof callback === 'function') callback();
        return true;
      });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  afterAll(() => {
    logger.level = originalLevel;
  });

  const SECRET_VALUE = 'super-secret-real-value-should-never-appear';

  const CASES: Array<{ field: string; expectFullRedact: boolean }> = [
    // pre-existing coverage -- regression check
    { field: 'api_key', expectFullRedact: false },
    { field: 'apikey', expectFullRedact: false },
    { field: 'authorization', expectFullRedact: false },
    { field: 'provider_key', expectFullRedact: true },
    // F7: newly covered
    { field: 'access_token', expectFullRedact: false },
    { field: 'refresh_token', expectFullRedact: false },
    { field: 'client_secret', expectFullRedact: true },
    { field: 'password', expectFullRedact: true },
    { field: 'secret', expectFullRedact: true },
  ];

  for (const { field, expectFullRedact } of CASES) {
    it(`never writes the real value of '${field}' in plaintext`, () => {
      logger.info({ [field]: SECRET_VALUE }, `test log for ${field}`);
      const written = logLines.join('\n');
      expect(written).not.toContain(SECRET_VALUE);
      if (expectFullRedact) {
        expect(written).toContain('[REDACTED]');
      }
    });
  }

  it('email is partially masked, not fully redacted (unchanged behavior)', () => {
    logger.info({ email: 'realuser@example.com' }, 'test log for email');
    const written = logLines.join('\n');
    expect(written).not.toContain('realuser@example.com');
    expect(written).toContain('@example.com');
  });
});
