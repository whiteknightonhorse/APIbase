// Prints "DB suites skipped: N" after every run and fails the run when a dbDescribe suite was
// skipped while a disposable Postgres is expected (TEST_DATABASE_URL set). Never keyed on CI:
// deploy.yml runs jest without Postgres and its DB suites keep skipping there.
// Workers inherit DB_SUITES_SKIP_LOG from this process; tests/unit/helpers/shop-db.ts appends to it.
const fs = require('fs');
const os = require('os');
const path = require('path');

class DbSuitesReporter {
  constructor() {
    this.log = path.join(os.tmpdir(), `db-suites-skipped-${process.pid}.log`);
    fs.writeFileSync(this.log, '');
    process.env.DB_SUITES_SKIP_LOG = this.log;
    this.runId = String(process.pid);
    process.env.DB_SUITES_RUN_ID = this.runId;
  }

  // Drops the per-file databases tests/unit/helpers/shop-db.ts cloned during this run.
  async dropClones() {
    const base = process.env.TEST_DATABASE_URL;
    if (!base) return;
    const { Client } = require('pg');
    const admin = new URL(base);
    admin.pathname = '/postgres';
    const c = new Client({ connectionString: admin.toString() });
    try {
      await c.connect();
      const { rows } = await c.query('SELECT datname FROM pg_database WHERE datname LIKE $1', [
        `apibase\\_t\\_${this.runId}\\_%`,
      ]);
      for (const r of rows) await c.query(`DROP DATABASE IF EXISTS "${r.datname}" WITH (FORCE)`);
    } catch (e) {
      console.error(`could not drop test databases: ${e.message}`);
    } finally {
      await c.end().catch(() => {});
    }
  }

  async onRunComplete() {
    await this.dropClones();
    const files = fs.readFileSync(this.log, 'utf8').split('\n').filter(Boolean);
    fs.rmSync(this.log, { force: true });
    console.log(`DB suites skipped: ${files.length}`);
    if (files.length > 0 && process.env.TEST_DATABASE_URL) {
      console.error(`DB suites must run here; skipped in:\n  ${files.join('\n  ')}`);
      this.failed = true;
    }
  }

  getLastError() {
    if (this.failed) return new Error('DB suites were skipped while a test database is required');
  }
}

module.exports = DbSuitesReporter;
