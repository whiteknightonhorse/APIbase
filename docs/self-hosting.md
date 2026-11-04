# Self-Hosting APIbase

## Prerequisites

- Docker 24.0+ with Compose v2.0+
- 8GB+ RAM (16 containers)
- Ports: 8880 (Nginx), 3000 (API), 5432 (Postgres), 6379 (Redis) — all internal

## Quick Start

```bash
git clone https://github.com/whiteknightonhorse/APIbase.git
cd APIbase
cp .env.example .env    # edit: set POSTGRES_PASSWORD, X402_PAYMENT_ADDRESS, provider keys
docker compose build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Verify

Run the full test suite, including the DB suites, with `bash scripts/with-test-db.sh npm test` (disposable Postgres 16 in Docker; the run fails if any DB suite is skipped).

```bash
# Health check (Nginx on 8880)
curl http://localhost:8880/health/ready

# Check all 16 containers
docker compose ps

# View API logs
docker compose logs api --tail 20
```

See `.env.example` for all configuration options. Never commit `.env` to git.

For day-2 operations (container management, restarts, backups, monitoring), see [`runbook.md`](runbook.md).

## Backups

- The `postgres_backup` container (03:00 UTC, runs as uid 1003 `apibase`; its post-backup hook `scripts/backup-hooks/10-sha256` writes a `.sha256` beside each dump at dump time) writes `backups/{daily,last,weekly,monthly}/apibase-YYYYMMDD.sql.gz`. These directories are mode 750 owned by `apibase:apibase`; chown them once after upgrading from a root-owned install.
- `scripts/backup-encrypt.sh` (03:40 UTC) also dumps the `fleet` and `orchestra` databases (`fleet-YYYYMMDD.sql.gz`, `orchestra-YYYYMMDD.sql.gz`, `pg_dump` inside their containers, set by `extra_dumps` in `config/backup/offsite.json`; a failing fleet or orchestra dump logs `ENCRYPT WARN` and never blocks the apibase dump), rotates the `fleet-` and `orchestra-` dumps like the `apibase-` ones (newest `keep_server_copies`), and encrypts every dump with the age recipient into `backups/offsite-staging/`. It also writes `env-YYYYMMDD.tar.age`: `.env`, the secrets directory and `offsite.json` piped from `tar` into `age`, with no plaintext copy.
- `scripts/backup-verify.sh` runs `gzip -t` and the `.sha256` check on every dump in `daily/`; a failure appends a `backup_verify_failed` line to `backups/verify-outbox.jsonl`. `scripts/backup-offsite-check.sh --families` counts the staged files per family (apibase, fleet, orchestra, env).
- Laptop pull and restore: [`backup-offsite.md`](backup-offsite.md).

## Refund wallets

Refunds owed to payers are paid by a weekly job from one refund wallet per rail. Payouts ship off.

- Generate each key on the host, once per rail, in an interactive shell: `scripts/server-wallet-init.sh REFUND_SIGNER_KEY_BASE base` and `scripts/server-wallet-init.sh REFUND_SIGNER_KEY_TEMPO tempo`. The script writes the key only to `.env` (mode 600), prints only the address and appends it to the record file `~/apibase/wallets/server-wallets.json` (mode 644, addresses only; `REFUND_WALLET_RECORD` inside the containers is `/app/wallets/server-wallets.json`). Create `~/apibase/wallets` as the user that runs the script before the first `docker compose up`: api and worker read it through the read-only bind `./wallets:/app/wallets:ro` and never write it. It refuses to run when the key or its record exists; replacing a funded key is a manual sweep. There is no backup copy: losing the host loses the wallet balance, so fund only what the ceiling allows.
- If the key in `.env` does not match the record, or its record entry is missing, payouts for that rail stay off and `GET /health/refund-wallet` shows `key: mismatch`.
- Settings (defaults): `REFUND_PAYOUT_ENABLED=false`, `REFUND_PAYOUT_DRY_RUN=true`, `REFUND_PAYOUT_CRON=0 7 * * 1`, `REFUND_MIN_PAYOUT_USD=0.01`, `REFUND_FEE_MULTIPLE=10`, `REFUND_RUN_CAP_USD=50`, `REFUND_PERIOD_CAP_USD=200` (rolling 30 days), `REFUND_PAYER_RUN_CAP_USD=25`, `REFUND_WALLET_CEILING_USD=100`, `REFUND_LOW_BALANCE_USD=10`, `REFUND_CARRY_MAX_DAYS=90`, `REFUND_ETH_USD_FEED` (Chainlink ETH/USD on Base), `REFUND_PAYOUT_KILL_FILE` (default `/app/wallets/REFUND-PAYOUT-KILL`, on the host `~/apibase/wallets/REFUND-PAYOUT-KILL`; create the file to stop payouts at once; the worker and `/health/refund-wallet` `kill_file_present` see it). The rules are described in [payments.md](payments.md#refunds-owed-by-apibase).
- Dispute lane (off until a contract address is set; defaults empty): `GL_DISPUTE_CONTRACT=` (receipt-claim contract), `GL_DISPUTE_PAYMENT_CONTRACT=` (payment-claim contract), `GL_DISPUTE_RPC_URL=`, `GL_DISPUTE_KEY=` (APIbase's own GenLayer testnet key, never printed), `GL_DISPUTE_CONFIRM=` (set `1` only once the contracts ship `confirm_refund`). What the lane does is described in [payments.md](payments.md#refunds-owed-by-apibase).

## Temporary servers

A temporary `http.server` or database under `/tmp` carries a TTL in its start command (`timeout 48h python3 -m http.server …`) and is listed in reboot-readiness. `scripts/ops/reboot-readiness.sh` is read-only: it prints the enabled state of the boot units, containers whose restart policy is not `unless-stopped`/`always`, listening processes with PPID 1 started from `/tmp`, and the `/tmp` size. `/tmp` is cleared at boot, so cron logs go to the `logs/` directory of the install, never `/tmp`.
