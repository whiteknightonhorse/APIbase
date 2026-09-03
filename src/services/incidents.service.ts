import { z } from 'zod';
import { getPrisma } from './prisma.service';

/**
 * Incidents read service (AP-9, L1: "read-only, публично-безопасная
 * проекция"). Writes to `incidents` happen ONLY through
 * `scripts/autopilot/incident-cli.py` / `incident-engine.py` (I4: "единственная
 * ручка записи для агентов") — this module never mutates the table.
 *
 * Public projection deliberately DROPS `evidence` (L1: "без evidence-цитат
 * писем") — H4's own design is explicit that email-derived evidence is the
 * ONLY field that can carry an `UNTRUSTED-EMAIL-QUOTE:`-tagged quote; every
 * other column is either an internal enum/timestamp or `attempts` (an
 * actor/action/result audit trail written by the engine/CLI). `attempts` is
 * NOT a second evidence field by construction: autopilot_common.py's
 * `_redact_untrusted_evidence()` strips any `UNTRUSTED-EMAIL-QUOTE:`-tagged
 * string BEFORE a recurrence merge JSON-dumps evidence into an attempts
 * note (Fable ruling-1 REJECT #1 — that dump used to carry the quote
 * verbatim into this exact public projection). Both columns are safe for
 * an unauthenticated public read — same posture as `dashboardRouter`, this
 * is a status page, not a control surface.
 */

// Mirrored 1:1 from prisma/migrations/0009_autopilot_schema/migration.sql CHECK
// constraints — same "ONE place, kept in sync by review" convention
// autopilot_common.py's own KINDS/SEVERITIES/STATES comment documents for the
// Python side (this is the TS-side copy of the same two enums).
export const VALID_STATES = [
  'OPEN',
  'REMEDIATION_QUEUED',
  'WAITING_HUMAN',
  'VERIFYING',
  'RESOLVED',
  'STUCK',
] as const;
export const VALID_SEVERITIES = ['SEV1', 'SEV2', 'SEV3'] as const;

export type IncidentState = (typeof VALID_STATES)[number];
export type IncidentSeverity = (typeof VALID_SEVERITIES)[number];

export interface IncidentFilters {
  state?: string;
  severity?: string;
  provider?: string;
}

export interface PublicIncident {
  incident_id: string;
  dedup_key: string;
  provider: string;
  tool_id: string | null;
  kind: string;
  severity: string;
  state: string;
  detected_by: string;
  attempts: unknown;
  fleet_task_id: string | null;
  operator_file: string | null;
  next_recheck_at: Date | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

// `evidence` is deliberately absent from this select (L1) — Prisma only ever
// reads the columns listed here, so there is no "select-all-then-strip"
// step to accidentally skip.
const PUBLIC_SELECT = {
  incident_id: true,
  dedup_key: true,
  provider: true,
  tool_id: true,
  kind: true,
  severity: true,
  state: true,
  detected_by: true,
  attempts: true,
  fleet_task_id: true,
  operator_file: true,
  next_recheck_at: true,
  created_at: true,
  updated_at: true,
  resolved_at: true,
} as const;

const LIST_LIMIT = 100;

export function isValidIncidentId(id: string): boolean {
  return z.string().uuid().safeParse(id).success;
}

export async function listIncidents(filters: IncidentFilters): Promise<PublicIncident[]> {
  const prisma = getPrisma();
  const where: Record<string, string> = {};
  if (filters.state) where.state = filters.state;
  if (filters.severity) where.severity = filters.severity;
  if (filters.provider) where.provider = filters.provider;

  const rows = await prisma.incident.findMany({
    where,
    select: PUBLIC_SELECT,
    // SEV1 first (lexical order matches urgency for the fixed "SEV{n}"
    // format), most recently opened first within a severity.
    orderBy: [{ severity: 'asc' }, { created_at: 'desc' }],
    take: LIST_LIMIT,
  });
  return rows;
}

export async function getIncidentById(id: string): Promise<PublicIncident | null> {
  // incident_id is @db.Uuid — Prisma's UUID cast throws (uncaught) on a
  // malformed string instead of returning null, same landmine
  // appeal.service.ts's isValidAppealId already documents and guards for
  // moderation_appeals.appeal_id. Checked here so every caller is protected.
  if (!isValidIncidentId(id)) return null;
  const prisma = getPrisma();
  const row = await prisma.incident.findUnique({
    where: { incident_id: id },
    select: PUBLIC_SELECT,
  });
  return row;
}
