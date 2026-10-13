/**
 * @jest-environment node
 *
 * T-0388: design-M port of /dashboard must keep every metric of GET /api/v1/dashboard and
 * GET /api/v1/incidents visible. The real page script runs in jsdom against the page-baseline
 * fixture (tests/fixtures/page-baseline/dashboard-api.json) plus one hand-made provider that
 * exercises every optional field; one assertion per API field path.
 */
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'static/dashboard.html'), 'utf-8');
const fixture = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tests/fixtures/page-baseline/dashboard-api.json'), 'utf-8'),
);

const RICH = {
  provider: 'zz-rich',
  display_name: 'ZZ Rich Provider',
  health: { status: 'orange', latency_ms: 1234, last_check: '2026-10-13T11:11:00.000Z' },
  limits: {
    type: 'monthly',
    free_limit: 500,
    used: 120,
    remaining: 380,
    pct_remaining: 76,
    status: 'yellow',
  },
  balance: null,
  usage: { calls_today: 7, calls_this_month: 333, calls_total: 987654 },
  calls_24h: 4321,
  avg_latency_ms: 777,
  tool_count: 9,
  state: 'DEGRADED',
  risk: 'ELEVATED',
  reliability_score: 42,
  probe_age_s: 7300,
  open_incidents: 3,
};
const BALANCE = {
  ...RICH,
  provider: 'zz-balance',
  display_name: 'ZZ Balance Provider',
  balance: { balance_usd: 12.5 },
  open_incidents: 0,
};

const INCIDENTS = [
  ['WAITING_HUMAN', 'SEV1'],
  ['REMEDIATION_QUEUED', 'SEV2'],
  ['VERIFYING', 'SEV2'],
  ['OPEN', 'SEV2'],
  ['STUCK', 'SEV1'],
  ['RESOLVED', 'SEV2'],
].map(([state, severity], n) => ({
  incident_id: `0000000${n}-aaaa-bbbb-cccc-dddddddddddd`,
  provider: `inc-prov-${n}`,
  kind: `inc-kind-${n}`,
  severity,
  state,
  created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  fleet_task_id: `T-FLEET-${n}`,
  operator_file: `op-file-${n}.md`,
  attempts: [{}, {}],
}));

function boot(
  opts: {
    dashboard?: unknown;
    dashStatus?: number;
    dashFail?: 'error' | 'timeout';
    incStatus?: number;
  } = {},
) {
  const payload = opts.dashboard ?? {
    ...fixture,
    providers: [...fixture.providers, RICH, BALANCE],
  };
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://apibase.pro/dashboard',
    pretendToBeVisual: true,
    beforeParse(window: any) {
      window.XMLHttpRequest = function FakeXhr(this: any) {
        this.open = (_m: string, url: string) => {
          this.url = url;
        };
        this.send = () => {
          setTimeout(() => {
            const dash = String(this.url).includes('/dashboard');
            if (dash && opts.dashFail === 'error') return this.onerror();
            if (dash && opts.dashFail === 'timeout') return this.ontimeout();
            this.status = dash ? (opts.dashStatus ?? 200) : (opts.incStatus ?? 200);
            this.responseText = dash
              ? JSON.stringify(payload)
              : JSON.stringify({
                  incidents: INCIDENTS,
                  engine_heartbeat_at: new Date().toISOString(),
                  engine_heartbeat_stale: false,
                });
            this.onload();
          }, 0);
        };
      };
    },
  });
  return dom;
}
const settle = () => new Promise((r) => setTimeout(r, 30));
const norm = (s: string) => s.replace(/\s+/g, ' ');
/** visible text with a space at every element boundary (dt/dd, spans) */
const flat = (d: Document) =>
  norm(
    d.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]*>/g, ' '),
  ).replace(/&amp;/g, '&');
const richCell = (d: Document, label: string) => {
  const row = Array.from(d.querySelectorAll('.d-providers tbody.d-row')).find((r) =>
    (r.textContent || '').includes('ZZ Rich Provider'),
  )!;
  return norm(row.querySelector(`td[data-label="${label}"]`)!.textContent || '');
};

describe('T-0388 /dashboard design M renders every API field', () => {
  let doc: Document;
  let text: string;
  let mainDom: any;
  beforeAll(async () => {
    mainDom = boot();
    await settle();
    doc = mainDom.window.document;
    text = flat(doc);
  });
  afterAll(() => mainDom.window.close());

  const cases: Array<[string, string]> = [
    ['totals.providers', `PRV: ${fixture.totals.providers}`],
    ['totals.tools', `TOOLS: ${fixture.totals.tools}`],
    ['totals.providers_down', `DOWN: ${fixture.totals.providers_down}`],
    ['totals.calls_24h', `OPS/24H: ${fixture.totals.calls_24h.toLocaleString('en-US')}`],
    ['totals.providers_tracked', `TRACKED:${fixture.totals.providers_tracked}`],
    ['unknown count', 'UNKNOWN:'],
    ['generated_at', 'Updated:'],
    ['payment_system.mode_a.status/paid/refunded/stuck/window_minutes', 'Mode A (prepaid) '],
    ['payment_system.mode_a.description', fixture.payment_system.mode_a.description],
    ['payment_system.mode_a.last_check', 'Last check 2026-10-13 12:10 UTC'],
    [
      'payment_system.mode_b.latency_ms',
      `x402 (Mode B) ${fixture.payment_system.mode_b.latency_ms}ms`,
    ],
    ['payment_system.mode_b.network', `${fixture.payment_system.mode_b.network} (Base)`],
    ['payment_system.mode_b.facilitator', fixture.payment_system.mode_b.facilitator],
    ['payment_system.mode_b.testnet', 'Testnet no'],
    [
      'payment_system.mpp_health.latency_ms',
      `MPP (Mode C) ${fixture.payment_system.mpp_health.latency_ms}ms`,
    ],
    ['payment_system.mpp_health.network', `— ${fixture.payment_system.mpp_health.network}`],
    ['payment_system.mpp_health.rpc_url', fixture.payment_system.mpp_health.rpc_url],
    [
      'payment_system.local_settle_health',
      `x402 local settle ${fixture.payment_system.local_settle_health.successes}OK/${fixture.payment_system.local_settle_health.failures}FAIL (${fixture.payment_system.local_settle_health.window_minutes}m)`,
    ],
    ['payment_system.operator_wallet.address', fixture.payment_system.operator_wallet.address],
    [
      'payment_system.operator_wallet.balance_eth',
      `operator gas ${fixture.payment_system.operator_wallet.balance_eth.toFixed(4)} ETH`,
    ],
    [
      'payment_system.operator_wallet.min_balance_eth',
      `min ${fixture.payment_system.operator_wallet.min_balance_eth}`,
    ],
    [
      'payment_system.operator_wallet.warn_balance_eth',
      `warn ${fixture.payment_system.operator_wallet.warn_balance_eth}`,
    ],
    ['payment_system.operator_wallet.tier', `Tier ${fixture.payment_system.operator_wallet.tier}`],
    ['payment_system.operator_wallet.below_threshold', 'Below threshold no'],
    ['provider.display_name', 'ZZ Rich Provider'],
    ['provider category', 'Other'],
    ['provider.health.latency_ms', '1234ms'],
    ['provider.health.last_check', 'Last health check 2026-10-13 11:11 UTC'],
    ['provider.limits used/free_limit/pct_remaining/type', '120/500 (76%) /mo'],
    ['provider.balance.balance_usd', '$12.50'],
    ['provider.calls_24h', '4,321'],
    ['provider.usage.calls_total', '/ 987,654 total'],
    ['provider.usage.calls_today', 'Calls today 7'],
    ['provider.usage.calls_this_month', 'Calls this month 333'],
    ['provider.avg_latency_ms', 'Avg latency 777ms'],
    ['Detail expansion', 'Detail'],
    ['incident.provider', 'inc-prov-0'],
    ['incident.kind', 'inc-kind-0'],
    ['incident.severity', 'SEV1'],
    ['incident.state', 'WAITING_HUMAN'],
    ['incident.created_at age', 'age 3h 0m'],
    ['incident.operator_file', 'file: op-file-0.md'],
    ['incident.fleet_task_id', 'T-FLEET-1'],
    ['incident.attempts length', 'notes: 2'],
    ['incident short id', 'INC-000000'],
    ['severity banner', 'autopilot: SEV1: 2 open'],
    ['Needs you section', 'Needs you'],
    ['Self-healing section', 'Self-healing'],
    ['fleet count label', '6'],
  ];
  it.each(cases)('renders %s', (_name, needle) => {
    expect(text).toContain(needle);
  });

  it.each([
    ['provider.tool_count', 'Tools', '9'],
    ['provider.state', 'State', 'DEGRADED'],
    ['provider.risk', 'Risk', 'ELEVATED'],
    ['provider.reliability_score', 'Reliability', '42/100'],
    ['provider.probe_age_s', 'Probe age', '2h'],
    ['provider.open_incidents', 'Incidents', '3'],
  ])('renders %s in its table cell', (_n, label, value) => {
    expect(richCell(doc, label)).toBe(value);
  });

  it('renders Unlimited / Rate Limited / Paid limit forms', async () => {
    expect(text).toContain('Unlimited');
    const p = (limits: object) => ({
      ...RICH,
      provider: 'x',
      display_name: 'X One',
      limits: { ...RICH.limits, ...limits },
    });
    const dom = boot({
      dashboard: {
        ...fixture,
        providers: [p({ type: 'rate_limited', free_limit: 0, status: 'n/a' })],
      },
    });
    await settle();
    expect(flat(dom.window.document)).toContain('Rate Limited');
    dom.window.close();
  });

  it('renders the Fleet/Queue chips, legend and table headers', () => {
    for (const s of [
      'OPEN',
      'REMEDIATION_QUEUED',
      'WAITING_HUMAN',
      'VERIFYING',
      'RESOLVED',
      'STUCK',
    ])
      expect(text).toContain(s);
    expect(text).toContain('Legend:');
    for (const h of ['Provider', 'Kind', 'Sev', 'State', 'Age', 'Fleet task'])
      expect(text).toContain(h);
    expect(doc.querySelectorAll('#fleet-queue-content .state-tag').length).toBe(7);
  });

  it('every row carries data-label cells for the phone card layout', () => {
    expect(doc.querySelectorAll('.d-providers td[data-label]').length).toBeGreaterThan(100);
    expect(doc.querySelectorAll('.d-fleet td[data-label]').length).toBe(INCIDENTS.length * 7);
  });

  it('keeps every element id the scripts and the parity gate use', () => {
    for (const id of [
      'boot-screen',
      'dashboard-content',
      'main-content',
      'system-monitor',
      'uptime-counter',
      'timer',
      'gen-time',
      'sev-banner',
      'payment-status',
      't-providers',
      't-tools',
      't-calls',
      't-down',
      't-unknown',
      'search-input',
      'search-info',
      'cat-toggle',
      'cat-tags',
      'cat-count-label',
      'waiting-human-list',
      'remediation-list',
      'fleet-panel',
      'fleet-toggle',
      'fleet-count-label',
      'fleet-queue-content',
    ]) {
      const present = new JSDOM(html).window.document.getElementById(id);
      expect(present).not.toBeNull();
    }
  });

  it('search shows "Found N" and the empty-state texts', async () => {
    const dom = boot();
    await settle();
    const d = dom.window.document;
    const input = d.getElementById('search-input') as HTMLInputElement;
    input.value = 'zz ';
    input.dispatchEvent(new dom.window.Event('input'));
    await new Promise((r) => setTimeout(r, 250));
    expect(d.getElementById('search-info')!.textContent).toContain(
      'Found 2 providers matching "zz"',
    );
    dom.window.close();
  });
});

describe('T-0388 error and empty texts', () => {
  it.each([
    ['dashStatus 503', { dashStatus: 503 }, 'Dashboard unavailable (HTTP 503)'],
    ['network error', { dashFail: 'error' as const }, 'Network error — retrying in 60s'],
    ['timeout', { dashFail: 'timeout' as const }, 'Request timeout — retrying in 60s'],
  ])('%s', async (_n, opts, expected) => {
    const dom = boot(opts);
    await settle();
    expect(dom.window.document.getElementById('dashboard-content')!.textContent).toContain(
      expected,
    );
    dom.window.close();
  });

  it('parse failure', async () => {
    const bad = new JSDOM(html, {
      runScripts: 'dangerously',
      beforeParse(w: any) {
        w.XMLHttpRequest = function (this: any) {
          this.open = () => {};
          this.send = () =>
            setTimeout(() => {
              this.status = 200;
              this.responseText = '{not json';
              this.onload();
            }, 0);
        };
      },
    });
    await settle();
    expect(bad.window.document.getElementById('dashboard-content')!.textContent).toContain(
      'Failed to parse dashboard data',
    );
    expect(bad.window.document.getElementById('waiting-human-list')!.textContent).toContain(
      'Failed to load — status unknown',
    );
    bad.window.close();
  });

  it('empty incident sections', async () => {
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      beforeParse(w: any) {
        w.XMLHttpRequest = function (this: any) {
          this.open = (_m: string, u: string) => {
            this.u = u;
          };
          this.send = () =>
            setTimeout(() => {
              this.status = 200;
              this.responseText = this.u.includes('incidents')
                ? JSON.stringify({
                    incidents: [],
                    engine_heartbeat_at: new Date().toISOString(),
                    engine_heartbeat_stale: false,
                  })
                : JSON.stringify(fixture);
              this.onload();
            }, 0);
        };
      },
    });
    await settle();
    const d = dom.window.document;
    expect(d.getElementById('waiting-human-list')!.textContent).toContain('No incidents need you');
    expect(d.getElementById('remediation-list')!.textContent).toContain(
      'Nothing is being fixed right now',
    );
    dom.window.close();
  });
});
