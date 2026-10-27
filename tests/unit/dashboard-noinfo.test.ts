import * as fs from 'node:fs';
import * as path from 'node:path';

jest.mock('../../src/services/prisma.service', () => ({ getPrisma: jest.fn() }));
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: jest.fn().mockRejectedValue(new Error('no redis in this test')),
}));

import { getDashboardData } from '../../src/services/dashboard.service';
import { getPrisma } from '../../src/services/prisma.service';
import { ensureRedisConnected } from '../../src/services/redis.service';

/**
 * AP-10 (819-autopilot-dashboard-ui.md, item 5 + acceptance checklist item 3):
 * mutation control for the NOINFO-shaped columns AP-9 added to
 * `GET /api/v1/dashboard` (state/risk/reliability_score/probe_age_s) and
 * `GET /api/v1/incidents` (attempts/operator_file/fleet_task_id). A `null`
 * from those endpoints means "never measured" and must render as an explicit
 * NOINFO/"—"-shaped string, never silently coerced to 0/false/empty — the
 * exact twin-worlds mistake the project's own LAW forbids.
 *
 * `static/dashboard.html` has no build step and no module exports (a plain
 * inline `<script>` IIFE, same as every other static page in this repo) —
 * so this test does NOT reimplement the formatters and assert against that
 * copy (a reimplementation could silently drift from the real code and stay
 * green forever). Instead it extracts the REAL function source, verbatim,
 * out of the live file via regex and evaluates it in isolation (no DOM
 * needed — these are pure string-in/string-out helpers by construction),
 * same "assert on the real thing, not a reimplementation" convention
 * `dashboard-autopilot-status.test.ts` already uses for SQL text. This is
 * why those functions are written as single-line `function name(...) { ... }`
 * definitions in dashboard.html and carry a comment saying not to reformat
 * them across multiple lines — the regex below depends on that shape.
 */

const HTML_PATH = path.join(__dirname, '../../static/dashboard.html');
const html = fs.readFileSync(HTML_PATH, 'utf-8');

function extractFnSource(name: string): string {
  const re = new RegExp(`^[ \\t]*function ${name}\\([^)]*\\)[ \\t]*\\{.*\\}[ \\t]*$`, 'm');
  const match = html.match(re);
  if (!match) {
    throw new Error(
      `dashboard-noinfo.test.ts: could not find a single-line "function ${name}(...) { ... }" ` +
        `in static/dashboard.html — either it was renamed/removed or reformatted across ` +
        `multiple lines (this test's extraction regex requires the whole function body on ` +
        `one source line).`,
    );
  }
  return match[0].trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadFn<T extends (...args: any[]) => unknown>(name: string, deps: string[] = []): T {
  // `escHtml` (a dependency of tdNoinfo) uses `document.createElement`, which
  // doesn't exist in this test's plain node environment (no jsdom, see
  // jest.config.ts) — extracted verbatim like everything else here, just
  // evaluated with a minimal `document` stand-in instead of a browser DOM.
  const depsSrc = deps.map(extractFnSource).join('\n');
  const src = extractFnSource(name);
  const documentShim = `
    var document = { createElement: function() {
      var _text = '';
      return {
        appendChild: function(node) { _text += node.__text; },
        get innerHTML() {
          return _text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },
      };
    }, createTextNode: function(t) { return { __text: t }; } };
  `;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  return new Function(`${documentShim}\n${depsSrc}\n${src}\nreturn ${name};`)() as T;
}

describe('AP-10: static/dashboard.html NOINFO formatters (real source, not a reimplementation)', () => {
  const fmtState = loadFn<(v: string | null | undefined) => string>('fmtState');
  const fmtRisk = loadFn<(v: string | null | undefined) => string>('fmtRisk');
  const fmtReliability = loadFn<(v: number | null | undefined) => string>('fmtReliability');
  const fmtProbeAge = loadFn<(s: number | null | undefined) => string>('fmtProbeAge');
  const fmtAge = loadFn<(iso: string | null | undefined) => string>('fmtAge');
  const tdNoinfo = loadFn<(isMissing: boolean, text: string) => string>('tdNoinfo', ['escHtml']);
  // T-04 (2026-09-04): the dashboard's third twin-worlds pair — "no open
  // incidents" vs "the engine never measured anything" — must render
  // distinguishably. engineStaleText is the pure formatter feeding
  // renderBanner's stale branch; depends on fmtAge for the "N ago" phrasing.
  const engineStaleText = loadFn<(heartbeatAt: string | null | undefined) => string>(
    'engineStaleText',
    ['fmtAge'],
  );
  const sortProviders =
    loadFn<
      (
        list: Array<{ open_incidents: number; reliability_score: number | null }>,
      ) => Array<{ open_incidents: number; reliability_score: number | null }>
    >('sortProviders');

  describe('fmtState / fmtRisk — null is NOINFO, a real enum value passes through', () => {
    it('MUTATION CONTROL: null never renders as a falsy/zero-shaped value', () => {
      expect(fmtState(null)).toBe('NOINFO');
      expect(fmtState(undefined)).toBe('NOINFO');
      expect(fmtRisk(null)).toBe('NOINFO');
      expect(fmtState(null)).not.toBe('0');
      expect(fmtState(null)).not.toBe('');
    });
    it('a real state/risk value passes through unchanged', () => {
      expect(fmtState('DOWN')).toBe('DOWN');
      expect(fmtState('UNKNOWN')).toBe('UNKNOWN'); // real enum member, distinct from null
      expect(fmtRisk('CRITICAL')).toBe('CRITICAL');
      expect(fmtRisk('NOINFO')).toBe('NOINFO'); // risk's own enum also has a NOINFO member
    });
  });

  describe('fmtReliability — the classic 0-vs-null trap', () => {
    it('MUTATION CONTROL: reliability_score=0 (measured, terrible) must NOT render as NOINFO', () => {
      // A naive truthy-check rewrite (`v ? ... : 'NOINFO'` instead of a strict
      // null/undefined check) would make this fail: 0 is falsy in JS.
      expect(fmtReliability(0)).toBe('0/100');
      expect(fmtReliability(0)).not.toBe('NOINFO');
    });
    it('MUTATION CONTROL: reliability_score=null (never scored) must NOT render as 0', () => {
      expect(fmtReliability(null)).toBe('NOINFO');
      expect(fmtReliability(undefined)).toBe('NOINFO');
      expect(fmtReliability(null)).not.toBe('0/100');
    });
    it('a real non-zero score passes through', () => {
      expect(fmtReliability(87)).toBe('87/100');
    });
  });

  describe('fmtProbeAge — the classic 0-vs-null trap, seconds edition', () => {
    it('MUTATION CONTROL: probe_age_s=0 (probed just now) must NOT render as never-probed', () => {
      expect(fmtProbeAge(0)).toBe('0s');
      expect(fmtProbeAge(0)).not.toMatch(/never/);
    });
    it('MUTATION CONTROL: probe_age_s=null (never probed) must NOT render as 0s', () => {
      expect(fmtProbeAge(null)).toMatch(/never/);
      expect(fmtProbeAge(null)).not.toBe('0s');
      expect(fmtProbeAge(undefined)).toMatch(/never/);
    });
    it('formats real ages in the expected unit bucket', () => {
      expect(fmtProbeAge(45)).toBe('45s');
      expect(fmtProbeAge(120)).toBe('2m');
      expect(fmtProbeAge(7200)).toBe('2h');
      expect(fmtProbeAge(172800)).toBe('2d');
    });
  });

  describe('fmtAge — incident created_at age (screens 1 + 2 + incident page)', () => {
    it('null created_at renders NOINFO, not "0m"', () => {
      expect(fmtAge(null)).toBe('NOINFO');
      expect(fmtAge(undefined)).toBe('NOINFO');
    });
    it('a real timestamp renders a duration, not NOINFO', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
      expect(fmtAge(fiveMinAgo)).toMatch(/^\d+m$/);
    });
  });

  describe('tdNoinfo — the table-cell wrapper both code paths route through', () => {
    it('wraps only when the value is genuinely missing, and escapes the text either way', () => {
      expect(tdNoinfo(true, 'NOINFO')).toBe('<span class="noinfo">NOINFO</span>');
      expect(tdNoinfo(false, 'DOWN')).toBe('DOWN');
      expect(tdNoinfo(false, '<script>')).not.toContain('<script>');
    });
  });

  describe('sortProviders — (open_incidents desc, reliability asc), null reliability sorts last', () => {
    it('sorts by open_incidents desc first', () => {
      const list = [
        { open_incidents: 0, reliability_score: 50 },
        { open_incidents: 3, reliability_score: 90 },
        { open_incidents: 1, reliability_score: 10 },
      ];
      expect(sortProviders(list).map((p) => p.open_incidents)).toEqual([3, 1, 0]);
    });
    it('within equal open_incidents, sorts reliability ascending (worst first)', () => {
      const list = [
        { open_incidents: 0, reliability_score: 80 },
        { open_incidents: 0, reliability_score: 20 },
        { open_incidents: 0, reliability_score: 50 },
      ];
      expect(sortProviders(list).map((p) => p.reliability_score)).toEqual([20, 50, 80]);
    });
    it('MUTATION CONTROL: null reliability_score is NOT coerced to a number for ranking — it sorts last, not first/worst', () => {
      const list = [
        { open_incidents: 0, reliability_score: null },
        { open_incidents: 0, reliability_score: 5 },
        { open_incidents: 0, reliability_score: 95 },
      ];
      const order = sortProviders(list).map((p) => p.reliability_score);
      expect(order[order.length - 1]).toBeNull();
      expect(order).toEqual([5, 95, null]);
    });
  });

  describe('engineStaleText — T-04: "never measured" must read distinctly from "no incidents"/OK', () => {
    it('MUTATION CONTROL: heartbeatAt=null (engine never ran) says so explicitly, never implies OK', () => {
      const text = engineStaleText(null);
      expect(text).toMatch(/never run/i);
      expect(text).not.toMatch(/no open/i);
      expect(text).not.toMatch(/\bOK\b/);
    });
    it('a real (but stale) heartbeat timestamp reports how long ago it last ran, not "never"', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
      const text = engineStaleText(twoHoursAgo);
      expect(text).toMatch(/last ran/i);
      expect(text).toMatch(/2h/);
      expect(text).not.toMatch(/never run/i);
    });
  });
});

describe('T-0330: unmeasured is not healthy', () => {
  const NOW = Date.now();
  const baseRow = {
    tool_count: 1n,
    calls_24h: 0n,
    calls_today: 0n,
    calls_this_month: 0n,
    calls_total: 0n,
    paid_calls_24h: 0n,
    revenue_24h: null,
    avg_latency_ms: null,
    provider_state: 'HEALTHY',
    provider_risk: 'NORMAL',
    open_incidents: 0n,
  };
  async function run(rows: Array<Record<string, unknown>>) {
    (getPrisma as jest.Mock).mockReturnValue({
      $queryRawUnsafe: jest.fn().mockResolvedValue(rows),
    });
    return getDashboardData();
  }
  const calc = new Date(NOW - 3600_000);

  it('state HEALTHY + Redis health unknown + never probed -> reliability_score null, health unknown', async () => {
    const d = await run([
      {
        ...baseRow,
        provider: 'fixtureprov',
        reliability_score: 100,
        reliability_calculated_at: null,
        probe_interval_s: 3600,
        last_probe_at: null,
      },
    ]);
    const p = d.providers[0];
    expect(p.state).toBe('HEALTHY');
    expect(p.health.status).toBe('unknown');
    expect(p.reliability_score).toBeNull();
  });

  it('score is kept only with calc + fresh probe (<= 2x interval); stale probe -> null', async () => {
    // T-0586: health is the PG state, so a fresh probe keeps the score even with Redis down.
    const fresh = await run([
      {
        ...baseRow,
        provider: 'fixtureprov',
        reliability_score: 90,
        reliability_calculated_at: calc,
        probe_interval_s: 3600,
        last_probe_at: new Date(NOW - 7000_000),
      },
    ]);
    expect(fresh.providers[0].reliability_score).toBe(90);
    const stale = await run([
      {
        ...baseRow,
        provider: 'fixtureprov',
        reliability_score: 90,
        reliability_calculated_at: calc,
        probe_interval_s: 3600,
        last_probe_at: new Date(NOW - 7300_000),
      },
    ]);
    expect(stale.providers[0].reliability_score).toBeNull();
  });

  it('unlimited provider limits are n/a, never green', async () => {
    const d = await run([
      {
        ...baseRow,
        provider: 'polymarket',
        reliability_score: null,
        reliability_calculated_at: null,
        probe_interval_s: 3600,
        last_probe_at: null,
      },
    ]);
    expect(d.providers[0].limits.type).toBe('unlimited');
    expect(d.providers[0].limits.status).toBe('n/a');
  });

  describe('static/dashboard.html literals', () => {
    it("has no hard-coded statusDot('green')", () => {
      expect(html).not.toContain("statusDot('green')");
      expect(html).not.toMatch(/local_settle_health[^;]*Mode A/);
    });
    it('has no MEM:OK / NET:ONLINE literals', () => {
      expect(html).not.toMatch(/MEM:<\/span><span class="val">OK/);
      expect(html).not.toMatch(/NET:<\/span><span class="val">ONLINE/);
    });
    it('HEALTHY counter counts only green and UNKNOWN is shown next to it', () => {
      expect(html).toMatch(/if \(hs === 'green'\) hGreen\+\+;/);
      expect(html).toContain("UNKNOWN:' + hUnknown");
    });
  });
});

describe('T-0360', () => {
  const NOW = Date.now();
  const abrRow = () => ({
    tool_count: 1n,
    calls_24h: 0n,
    calls_today: 0n,
    calls_this_month: 0n,
    calls_total: 0n,
    paid_calls_24h: 0n,
    revenue_24h: null,
    avg_latency_ms: null,
    provider_state: 'HEALTHY',
    provider_risk: 'NORMAL',
    open_incidents: 0n,
    provider: 'abr',
    reliability_score: 100,
    reliability_calculated_at: new Date(NOW - 3600_000),
    probe_interval_s: 21600,
    last_probe_at: new Date(NOW - 21526_000),
  });
  async function run(rows: Array<Record<string, unknown>>) {
    (getPrisma as jest.Mock).mockReturnValue({
      $queryRawUnsafe: jest.fn().mockResolvedValue(rows),
    });
    return getDashboardData();
  }

  it('prod fixture 2026-10-12: rows with health unknown but a reliability_score (the dispatcher post-deploy jq)', () => {
    // This predicate is the dispatcher's post-deploy jq; the test pins that both
    // agree on the shape of the real payload.
    const fixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../fixtures/dashboard-prod-2026-10-12.json'), 'utf-8'),
    ) as {
      providers: Array<{ health: { status: string }; reliability_score: number | null }>;
    };
    const n = fixture.providers.filter(
      (p) => p.health.status === 'unknown' && p.reliability_score !== null,
    ).length;
    expect(n).toBe(225);
  });

  it('abr row that passed the old gate: probe 6 h old -> health stale (T-0586), reliability_score null', async () => {
    const d = await run([abrRow()]);
    const p = d.providers[0];
    expect(p.health.status).toBe('stale');
    expect(p.probe_age_s).toBeGreaterThanOrEqual(21526);
    expect(p.probe_age_s).toBeLessThanOrEqual(21530);
    expect(p.reliability_score).toBeNull();
  });

  it('same row with a fresh probe and a live Redis health hash -> health green, score kept, no conflict', async () => {
    // getDashboardData calls ensureRedisConnected twice (cache read, then health read),
    // so the same client is served for both; get() -> null keeps the cache cold.
    const client = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => 'OK'),
      setex: jest.fn(async () => 'OK'),
      hgetall: jest.fn(async (k: string) =>
        k === 'provider:health:abr'
          ? { status: 'green', latency_ms: '120', last_check: new Date(NOW).toISOString() }
          : {},
      ),
    };
    (ensureRedisConnected as jest.Mock).mockResolvedValueOnce(client).mockResolvedValueOnce(client);
    const d = await run([{ ...abrRow(), last_probe_at: new Date(NOW - 100_000) }]);
    const p = d.providers[0];
    expect(p.health.status).toBe('green');
    expect(p.health.conflict).toBe(false);
    expect(p.reliability_score).toBe(100);
  });
});
