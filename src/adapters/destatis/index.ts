import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { DestatisTableResponse, DestatisTableOutput, DestatisTableRow } from './types';

const GENESIS_BASE = 'https://genesis.destatis.de/genesisWS/rest/2020';

/**
 * GENESIS table codes verified live 2026-08-24 with `data/table` (sync mode).
 * 81000BM001 (proposed in UC-452) does not exist — replaced with 81000-0001.
 * 51000-0007 exists but returns Status.Code 98 "too big for dialogue-processing"
 * (requires async job=true polling) — replaced with the smaller 51000-0001.
 */
const TABLE_FOR_TOOL: Record<string, { code: string; title: string }> = {
  'destatis.gdp': {
    code: '81000-0001',
    title: 'National accounts — gross value added, gross domestic product (Germany, years)',
  },
  'destatis.population': {
    code: '12411-0001',
    title: 'Population — Germany, reference date (current population update)',
  },
  'destatis.prices': {
    code: '61111-0001',
    title: 'Consumer price index — Germany, years',
  },
  'destatis.trade': {
    code: '51000-0001',
    title: 'Exports and imports (foreign trade) — Germany, years',
  },
};

/** A data row's first cell is a year, year-month, year-month-day, or "Quarter N YYYY" period label. */
const PERIOD_RE = /^\d{4}(-\d{2}(-\d{2})?)?$|^Quarter\s+\d\s+\d{4}$/i;

/**
 * GENESIS `format=json` still returns the actual table payload as semicolon-delimited
 * plain text inside `Object.Content` (the envelope's own `format` echoes back
 * "datencsv" regardless — there is no structured-JSON table format in this API version).
 * This parses that text into rows/columns, splitting off the trailing footnote block
 * (marked by a line of underscores) from the data block.
 */
function parseGenesisTable(content: string): {
  columns: string[];
  rows: DestatisTableRow[];
  notes: string;
} {
  const lines = content.split(/\r?\n/);
  const sepIdx = lines.findIndex((l) => /^_+$/.test(l.trim()));
  const dataLines = sepIdx >= 0 ? lines.slice(0, sepIdx) : lines;
  const footerLines = sepIdx >= 0 ? lines.slice(sepIdx + 1) : [];

  const columns: string[] = [];
  const rows: DestatisTableRow[] = [];

  for (const line of dataLines) {
    if (!line.includes(';')) continue;
    const cells = line.split(';');
    const first = cells[0].trim();

    if (PERIOD_RE.test(first)) {
      const values = cells.slice(1).map((c) => {
        const t = c.trim();
        if (t === '' || t === '-' || t === '.' || t === 'x' || t === '/') return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : t;
      });
      rows.push({ period: first, values });
    } else if (first === '' && cells.slice(1).some((c) => c.trim() !== '')) {
      columns.push(
        cells
          .slice(1)
          .map((c) => c.trim())
          .filter(Boolean)
          .join(' | '),
      );
    }
  }

  const notes = footerLines
    .join(' ')
    .replace(/^"+|"+$/g, '')
    .trim();

  return { columns, rows, notes };
}

/**
 * Destatis GENESIS-Online adapter (UC-452).
 *
 * German official statistics (Statistisches Bundesamt) — national accounts,
 * population, consumer prices, foreign trade. DL-DE/BY-2-0 open data licence.
 *
 * Auth gotcha (verified live 2026-08-24): username/password MUST be sent as
 * literal HTTP request headers, NOT as fields in the POST body. Sending them
 * in the body silently falls through to an unauthenticated GAST/guest path
 * (Status.Code 15) that is indistinguishable from a real auth failure unless
 * tested with a bogus-credential control.
 */
export class DestatisAdapter extends BaseAdapter {
  private readonly username: string;
  private readonly password: string;

  constructor(username: string, password: string) {
    super({ provider: 'destatis', baseUrl: GENESIS_BASE, maxResponseBytes: 3_000_000 });
    this.username = username;
    this.password = password;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const meta = TABLE_FOR_TOOL[req.toolId];
    if (!meta) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const body = new URLSearchParams();
    body.set('name', meta.code);
    body.set('area', 'all');
    body.set('format', 'json');
    body.set('language', params.language === 'de' ? 'de' : 'en');
    if (params.startyear) body.set('startyear', String(params.startyear));
    if (params.endyear) body.set('endyear', String(params.endyear));

    return {
      url: `${GENESIS_BASE}/data/table`,
      method: 'POST',
      headers: {
        username: this.username,
        password: this.password,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'APIbase.pro/1.0 (+https://apibase.pro)',
      },
      body: body.toString(),
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const meta = TABLE_FOR_TOOL[req.toolId];
    const body = raw.body as DestatisTableResponse;
    const status = body?.Status;

    // GENESIS returns HTTP 200 even for application-level failures (e.g. Code 104
    // "no objects matching selection" for an out-of-range startyear/endyear filter,
    // Code 98 "table too big" if a future edit widens the requested range). Both
    // are caller-fixable input problems, not gateway/provider failures.
    if (!status || status.Code !== 0) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: `GENESIS-Online returned Code ${status?.Code ?? 'unknown'}: ${status?.Content ?? 'no Status in response'}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    const content = body.Object?.Content ?? '';
    const { columns, rows, notes } = parseGenesisTable(content);

    const output: DestatisTableOutput = {
      table_id: meta.code,
      title: meta.title,
      columns,
      rows,
      notes,
      source: 'Statistisches Bundesamt (Destatis) — GENESIS-Online, DL-DE/BY-2-0',
    };
    return output;
  }
}
