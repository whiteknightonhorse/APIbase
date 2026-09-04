-- T-04 (2026-09-04): "autopilot: OK" on the public dashboard used to mean only
-- "GET /api/v1/incidents returned no open SEV1/SEV2 row" -- which reads
-- identically whether the incident-engine has been ticking for months or has
-- NEVER RUN AT ALL (the actual incident: the engine's cron line was never
-- installed, so the dashboard showed green for a system that had measured
-- nothing, until a dispatcher wired the cron and a manual run immediately
-- opened 13 real incidents, one SEV1). not_measured != 0 -- see the design
-- note on ENGINE_HEARTBEAT_STALE_S (src/config/autopilot.ts).
--
-- Why a DB table and not just the /tmp heartbeat file incident-engine.py
-- already wrote (write_heartbeat(), AP-4): the containerized Node API and the
-- host cron script do not share a filesystem -- docker-compose.yml gives
-- every app service its own `tmpfs: - /tmp`, confirmed live. Postgres is the
-- one channel that already crosses that boundary (every other autopilot
-- write -- provider_status, incidents, ... -- goes through it via
-- `docker exec psql`, same as this one will).
CREATE TABLE IF NOT EXISTS "autopilot_engine_heartbeat" (
    "engine"      TEXT        NOT NULL,
    "last_run_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "autopilot_engine_heartbeat_pkey" PRIMARY KEY ("engine")
);
