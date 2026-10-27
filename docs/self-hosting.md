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

## Temporary servers

A temporary `http.server` or database under `/tmp` carries a TTL in its start command (`timeout 48h python3 -m http.server …`) and is listed in reboot-readiness. `scripts/ops/reboot-readiness.sh` is read-only: it prints the enabled state of the boot units, containers whose restart policy is not `unless-stopped`/`always`, listening processes with PPID 1 started from `/tmp`, and the `/tmp` size. `/tmp` is cleared at boot, so cron logs go to the `logs/` directory of the install, never `/tmp`.
