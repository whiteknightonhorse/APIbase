import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { logger } from '../../config/logger';
import type {
  NrcRawRow,
  NrcReactorSnapshot,
  NrcCurrentStatusOutput,
  NrcReactorHistoryOutput,
  NrcOutagesOutput,
  NrcAnnualDataOutput,
} from './types';

const NRC_BASE = 'https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status';
const NRC_365_URL = `${NRC_BASE}/PowerReactorStatusForLast365Days.txt`;
const USER_AGENT = 'APIbase/1.0 (https://apibase.pro; energy-data-aggregator)';

/**
 * US Nuclear Regulatory Commission (NRC) Power Reactor Status adapter (UC-563).
 *
 * Supported tools (read-only, no auth):
 *   nrc.current_status   → parse latest day from 365-day pipe-delimited text file
 *   nrc.reactor_history  → filter 365-day file by reactor unit name + date window
 *   nrc.outages          → filter 365-day file for reactors below power threshold
 *   nrc.annual_data      → fetch annual archive file for a specific year
 *
 * Auth: None (US Government public domain — Atomic Energy Act).
 * Data: ReportDt|Unit|Power  pipe-delimited text, updated daily M-F.
 * Note: Overrides call() because the upstream returns text/plain, not JSON.
 */
export class NrcAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'nrc', baseUrl: NRC_BASE });
  }

  protected buildRequest(): { url: string; method: string; headers: Record<string, string> } {
    // Not used — call() is fully overridden for text/plain handling
    return { url: '', method: 'GET', headers: {} };
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = req.params as Record<string, unknown>;
    let data: unknown;

    switch (req.toolId) {
      case 'nrc.current_status':
        data = await this.currentStatus();
        break;
      case 'nrc.reactor_history':
        data = await this.reactorHistory(params);
        break;
      case 'nrc.outages':
        data = await this.outages(params);
        break;
      case 'nrc.annual_data':
        data = await this.annualData(params);
        break;
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: 'nrc',
          toolId: req.toolId,
          durationMs: 0,
        };
    }

    const durationMs = Math.round(performance.now() - start);
    logger.info({ tool_id: req.toolId, duration_ms: durationMs }, 'NRC query completed');

    return {
      status: 200,
      headers: {},
      body: data,
      durationMs,
      byteLength: JSON.stringify(data).length,
    };
  }

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------

  private async fetchText(url: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
      });
    } catch (error) {
      throw {
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: `NRC connection failed: ${error instanceof Error ? error.message : 'unknown'}`,
        provider: 'nrc',
        toolId: '',
        durationMs: 0,
      };
    }

    if (!response.ok) {
      throw {
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: `NRC returned HTTP ${response.status}`,
        provider: 'nrc',
        toolId: '',
        durationMs: 0,
      };
    }

    return response.text();
  }

  /**
   * Parse the pipe-delimited NRC text file into structured rows.
   * Format: ReportDt|Unit|Power  (header on first line, skipped).
   */
  private parseRows(text: string): NrcRawRow[] {
    const lines = text.trim().split('\n');
    const rows: NrcRawRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('|');
      if (parts.length !== 3) continue;
      const power = parseInt(parts[2].trim(), 10);
      if (isNaN(power)) continue;
      rows.push({
        date: parts[0].trim(),
        unit: parts[1].trim(),
        power,
      });
    }
    return rows;
  }

  /**
   * Convert NRC date string "M/D/YYYY 12:00:00 AM" to ISO date "YYYY-MM-DD".
   */
  private toIsoDate(nrcDate: string): string {
    // Format: "7/1/2026 12:00:00 AM"
    const datePart = nrcDate.split(' ')[0];
    if (!datePart) return nrcDate;
    const [m, d, y] = datePart.split('/');
    if (!m || !d || !y) return nrcDate;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  private powerStatus(pct: number): 'full_power' | 'reduced_power' | 'shutdown' {
    if (pct === 100) return 'full_power';
    if (pct > 0) return 'reduced_power';
    return 'shutdown';
  }

  private toSnapshot(row: NrcRawRow): NrcReactorSnapshot {
    return {
      unit: row.unit,
      power_pct: row.power,
      status: this.powerStatus(row.power),
      date: this.toIsoDate(row.date),
    };
  }

  // ---------------------------------------------------------------------------
  // Tool implementations
  // ---------------------------------------------------------------------------

  private async currentStatus(): Promise<NrcCurrentStatusOutput> {
    const text = await this.fetchText(NRC_365_URL);
    const rows = this.parseRows(text);

    // Find the most-recent date (rows are sorted newest-first per the NRC file)
    const latestNrcDate = rows[0]?.date ?? '';
    const latestRows = rows.filter((r) => r.date === latestNrcDate);

    const snapshots = latestRows.map((r) => this.toSnapshot(r));
    const atFull = snapshots.filter((s) => s.status === 'full_power').length;
    const reduced = snapshots.filter((s) => s.status === 'reduced_power').length;
    const shutdown = snapshots.filter((s) => s.status === 'shutdown').length;

    return {
      report_date: this.toIsoDate(latestNrcDate),
      total_reactors: snapshots.length,
      at_full_power: atFull,
      reduced_power: reduced,
      shutdown,
      reactors: snapshots.sort((a, b) => a.unit.localeCompare(b.unit)),
    };
  }

  private async reactorHistory(params: Record<string, unknown>): Promise<NrcReactorHistoryOutput> {
    const unit = String(params.unit ?? '').trim();
    if (!unit) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: 'unit is required (e.g. "Arkansas Nuclear 1")',
        provider: 'nrc',
        toolId: 'nrc.reactor_history',
        durationMs: 0,
      };
    }

    const days = Math.min(Math.max(Number(params.days) || 30, 1), 365);

    const text = await this.fetchText(NRC_365_URL);
    const rows = this.parseRows(text);

    // Case-insensitive match on unit name
    const unitLower = unit.toLowerCase();
    const matching = rows.filter((r) => r.unit.toLowerCase() === unitLower);

    if (matching.length === 0) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `No data found for reactor unit "${unit}". Check spelling — use the full name as reported by NRC (e.g. "Arkansas Nuclear 1", "Diablo Canyon 1").`,
        provider: 'nrc',
        toolId: 'nrc.reactor_history',
        durationMs: 0,
      };
    }

    // Take newest N days (rows are newest-first)
    const sliced = matching.slice(0, days);
    const history = sliced.map((r) => ({
      date: this.toIsoDate(r.date),
      power_pct: r.power,
      status: this.powerStatus(r.power),
    }));

    return {
      unit: matching[0].unit,
      days_requested: days,
      days_returned: history.length,
      from_date: history.length > 0 ? (history[history.length - 1]?.date ?? '') : '',
      to_date: history.length > 0 ? (history[0]?.date ?? '') : '',
      history,
    };
  }

  private async outages(params: Record<string, unknown>): Promise<NrcOutagesOutput> {
    const threshold = Math.min(Math.max(Number(params.max_power ?? 99), 0), 100);

    const text = await this.fetchText(NRC_365_URL);
    const rows = this.parseRows(text);

    const latestNrcDate = rows[0]?.date ?? '';
    const latestRows = rows.filter((r) => r.date === latestNrcDate);
    const below = latestRows.filter((r) => r.power <= threshold);

    const snapshots = below
      .map((r) => this.toSnapshot(r))
      .sort((a, b) => a.power_pct - b.power_pct);

    return {
      report_date: this.toIsoDate(latestNrcDate),
      threshold_pct: threshold,
      total_below_threshold: snapshots.length,
      reactors: snapshots,
    };
  }

  private async annualData(params: Record<string, unknown>): Promise<NrcAnnualDataOutput> {
    const currentYear = new Date().getFullYear();
    const year = Math.min(Math.max(Number(params.year) || currentYear, 1999), currentYear);
    const unitFilter = params.unit ? String(params.unit).trim() : undefined;
    const limit = Math.min(Math.max(Number(params.limit) || 200, 1), 1000);

    const url = `${NRC_BASE}/${year}/${year}PowerStatus.txt`;
    const text = await this.fetchText(url);
    const rows = this.parseRows(text);

    const filtered = unitFilter
      ? rows.filter((r) => r.unit.toLowerCase() === unitFilter.toLowerCase())
      : rows;

    const sliced = filtered.slice(0, limit);
    const units = new Set(filtered.map((r) => r.unit));
    const dates = new Set(filtered.map((r) => r.date));

    return {
      year,
      unit_filter: unitFilter,
      total_records: filtered.length,
      reactors_covered: units.size,
      dates_covered: dates.size,
      records: sliced.map((r) => ({
        date: this.toIsoDate(r.date),
        unit: r.unit,
        power: r.power,
      })),
    };
  }
}
