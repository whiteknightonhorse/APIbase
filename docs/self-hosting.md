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
