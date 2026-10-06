/**
 * T-INT-30 SW1-SW10: the Sea Hunter canvas widget on the home page. The real inline script is run in a
 * node:vm context against a small hand-written DOM/canvas mock (no jsdom dependency in this repo).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const html = () => read('static/index.html');
const SRC = () => read('static/js/sea-hunter.js');
const KB = 1024;

const inlineScripts = (s: string) =>
  [...s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/type="application\/ld\+json"/.test(m[1]))
    .map((m) => m[2]);
const widgetScript = () => inlineScripts(html()).find((b) => b.includes('sh-cv'))!;

const NOW = Date.parse('2026-10-06T12:00:00Z');
const minAgo = (m: number) => new Date(NOW - m * 60000).toISOString();

type Fixture = Record<string, unknown>;
const WORKING: Fixture = {
  stale: false,
  fleet_paused: false,
  ships: [
    { id: 'builder-1', class: 'builder', state: 'working', since_s: 30, activity_level: 3 },
    { id: 'scout-1', class: 'scout', state: 'idle', since_s: 900, activity_level: 0 },
  ],
  external: {
    window_s: 900,
    calls: 7,
    agents_bucket: '1-5',
    by_category: [{ category: 'weather', calls: 7 }],
  },
  honesty: { last_activity_at: minAgo(1) },
};
const EMPTY: Fixture = {
  stale: false,
  fleet_paused: false,
  ships: [],
  external: { window_s: 900, calls: 0, agents_bucket: '0', by_category: [] },
  honesty: { last_activity_at: minAgo(12) },
};
const STALE: Fixture = { ...WORKING, stale: true };
const PAUSED: Fixture = {
  ...WORKING,
  fleet_paused: true,
  paused_until_minute: '2026-10-06T13:40:00Z',
  ships: [{ id: 'builder-1', class: 'builder', state: 'resting', since_s: 30, activity_level: 0 }],
  external: { window_s: 900, calls: 0, agents_bucket: '0', by_category: [] },
};

interface Opts {
  fixture: Fixture;
  reduced?: boolean;
  withObserver?: boolean;
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

function harness(script: string, o: Opts) {
  const stats = { raf: 0, frames: 0, fetched: [] as string[] };
  let queue: Array<{ id: number; cb: (t: number) => void }> = [];
  let nextId = 1;
  const listeners: Record<string, Record<string, Array<(e?: unknown) => void>>> = {
    doc: {},
    cv: {},
    btn: {},
  };
  const on = (who: string) => (type: string, fn: (e?: unknown) => void) => {
    (listeners[who][type] ||= []).push(fn);
  };
  const emit = (who: string, type: string, e?: unknown) =>
    (listeners[who][type] || []).forEach((f) => f(e));

  const ctx2d = (count: boolean) =>
    new Proxy({} as Record<string, unknown>, {
      get: (t, k: string) =>
        k === 'clearRect' && count ? () => void stats.frames++ : k in t ? t[k] : () => undefined,
      set: (t, k: string, v) => ((t[k] = v), true),
    });
  const mainCtx = ctx2d(true);
  const cv = {
    width: 0,
    height: 0,
    clientWidth: 640,
    getContext: () => mainCtx,
    addEventListener: on('cv'),
    setAttribute: () => undefined,
    observed: false,
  };
  const cap = { textContent: '' };
  const btn = {
    textContent: 'Pause',
    hidden: false,
    addEventListener: on('btn'),
    setAttribute: () => undefined,
  };
  const doc = {
    readyState: 'complete',
    hidden: false,
    getElementById: (id: string) => ({ 'sh-cv': cv, 'sh-txt': cap, 'sh-pause': btn })[id] ?? null,
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d(false) }),
    addEventListener: on('doc'),
  };
  let ioCb: ((es: Array<{ isIntersecting: boolean }>) => void) | null = null;
  class IO {
    constructor(cb: (es: Array<{ isIntersecting: boolean }>) => void) {
      ioCb = cb;
    }
    observe() {
      cv.observed = true;
    }
  }
  const sandbox: Record<string, unknown> = {
    document: doc,
    window: {
      matchMedia: (q: string) => ({ matches: !!o.reduced && /reduce/.test(q) }),
    },
    fetch: (u: string) => {
      stats.fetched.push(u);
      return Promise.resolve({ ok: true, json: () => Promise.resolve(o.fixture) });
    },
    requestAnimationFrame: (cb: (t: number) => void) => {
      stats.raf++;
      const id = nextId++;
      queue.push({ id, cb });
      return id;
    },
    cancelAnimationFrame: (id: number) => {
      queue = queue.filter((q) => q.id !== id);
    },
    setTimeout: () => 1,
    clearTimeout: () => undefined,
    Date: { now: () => NOW, parse: Date.parse },
  };
  if (o.withObserver !== false) sandbox.IntersectionObserver = IO;
  vm.runInNewContext(script, sandbox);

  return {
    stats,
    cap,
    btn,
    cv,
    doc,
    queued: () => queue.length,
    tick: (ts = 1000) => {
      const q = queue;
      queue = [];
      q.forEach((x) => x.cb(ts));
    },
    show: async (v = true) => {
      ioCb!([{ isIntersecting: v }]);
      await flush();
    },
    click: () => emit('btn', 'click'),
    visibility: (hidden: boolean) => {
      doc.hidden = hidden;
      emit('doc', 'visibilitychange');
    },
  };
}

async function shown(script: string, o: Opts) {
  const h = harness(script, o);
  await h.show();
  return h;
}

// Scenario predicates, reused by the mutation checks.
async function stalePredicate(script: string) {
  const h = await shown(script, { fixture: STALE });
  return h.cap.textContent.includes('Telemetry stale') && h.stats.raf === 0;
}
async function pausePredicate(script: string) {
  const h = await shown(script, { fixture: WORKING });
  if (h.stats.raf < 1) return false;
  h.click();
  h.tick();
  const afterPause = h.stats.raf;
  if (h.queued() !== 0 || afterPause !== 1) return false;
  h.click();
  return h.stats.raf === afterPause + 1;
}

describe('SW1/SW10 size', () => {
  it('SW1: the inline widget script is at most 25 KB', () => {
    const bytes = Buffer.byteLength(widgetScript());
    expect(bytes).toBeGreaterThan(1000);
    expect(bytes).toBeLessThanOrEqual(25 * KB);
  });
  it('SW10: all inline JS <= 25 KB and 40 lines; HTML without the widget <= 35 KB', () => {
    const page = html();
    const blocks = inlineScripts(page);
    const jsBytes = blocks.reduce((n, b) => n + Buffer.byteLength(b), 0);
    const lines = blocks.reduce((n, b) => n + b.trim().split('\n').length, 0);
    const rest = Buffer.byteLength(page) - Buffer.byteLength(widgetScript());
    process.stdout.write(
      `SW10 inline_js_bytes=${jsBytes} inline_js_lines=${lines} html_without_widget_bytes=${rest}\n`,
    );
    expect(jsBytes).toBeLessThanOrEqual(25 * KB);
    expect(lines).toBeLessThanOrEqual(40);
    expect(rest).toBeLessThanOrEqual(35 * KB);
  });
  it('the inlined copy is exactly the minified static/js/sea-hunter.js', () => {
    const r = spawnSync('node', ['scripts/inline-sea-hunter.cjs', '--check'], { cwd: ROOT });
    expect(r.status).toBe(0);
  });
});

describe('SW2 no external resources', () => {
  it('no absolute URLs; the only path is /api/v1/fleet/sea', () => {
    for (const js of [SRC(), widgetScript()]) {
      expect(js).not.toMatch(
        /https?:|\/\/[a-z0-9-]+\.[a-z]{2,}|\bimport\s*\(|\bXMLHttpRequest\b|WebSocket|EventSource/i,
      );
      const paths = js.match(/\/api\/[A-Za-z0-9/_-]*/g) ?? [];
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) expect(p).toBe('/api/v1/fleet/sea');
    }
  });
  it('lazy: nothing is fetched before the widget is in view; only the sea endpoint is fetched after', async () => {
    const h = harness(widgetScript(), { fixture: WORKING });
    await flush();
    expect(h.stats.fetched).toEqual([]);
    await h.show();
    expect(h.stats.fetched).toEqual(['/api/v1/fleet/sea']);
  });
});

describe('SW3 stale', () => {
  it('shows "Telemetry stale" and requests no animation frame', async () => {
    const h = await shown(widgetScript(), { fixture: STALE });
    expect(h.cap.textContent).toBe('Telemetry stale');
    expect(h.stats.frames).toBe(1);
    expect(h.stats.raf).toBe(0);
  });
  it('a failed fetch is reported as stale too', async () => {
    const s = widgetScript().replace(/fetch\(/, 'Promise.reject.bind(Promise)(');
    const h2 = await shown(s, { fixture: WORKING });
    expect(h2.cap.textContent).toBe('Telemetry stale');
    expect(h2.stats.raf).toBe(0);
  });
  it('mutation: without the stale branch SW3 goes red', async () => {
    expect(await stalePredicate(SRC())).toBe(true);
    const mutated = SRC()
      .replace("'Telemetry stale'", "'Telemetry ok'")
      .replace(/!d\.stale && /g, '');
    expect(mutated).not.toBe(SRC());
    expect(await stalePredicate(mutated)).toBe(false);
  });
});

describe('SW4/SW5 honest texts', () => {
  it('SW4: paused fleet -> "Fleet resting until 13:40 UTC"', async () => {
    const h = await shown(widgetScript(), { fixture: PAUSED });
    expect(h.cap.textContent).toContain('Fleet resting until 13:40 UTC');
    expect(h.stats.raf).toBe(0);
  });
  it('SW5: empty fleet -> calm sea with the age of the last activity', async () => {
    const h = await shown(widgetScript(), { fixture: EMPTY });
    expect(h.cap.textContent).toContain('Calm sea. No agents working right now.');
    expect(h.cap.textContent).toContain('Last activity 12 min ago');
    expect(h.stats.raf).toBe(0);
  });
});

describe('SW6 reduced motion', () => {
  it('draws one static frame and never requests an animation frame', async () => {
    const h = await shown(widgetScript(), { fixture: WORKING, reduced: true });
    expect(h.stats.frames).toBe(1);
    expect(h.stats.raf).toBe(0);
    expect(h.btn.hidden).toBe(true);
    expect(h.cap.textContent).toContain('Ships: 1 working, 1 idle, 0 resting');
  });
});

describe('SW7 pause button', () => {
  it('Pause stops the frame loop, Resume restarts it', async () => {
    expect(await pausePredicate(widgetScript())).toBe(true);
  });
  it('the button label and aria-pressed follow the state', async () => {
    const h = await shown(widgetScript(), { fixture: WORKING });
    h.click();
    expect(h.btn.textContent).toBe('Resume');
    h.click();
    expect(h.btn.textContent).toBe('Pause');
  });
  it('mutation: without the Pause button handler SW7 goes red', async () => {
    const mutated = SRC().replace("btn.addEventListener('click'", "btn.addEventListener('noop'");
    expect(mutated).not.toBe(SRC());
    expect(await pausePredicate(mutated)).toBe(false);
  });
});

describe('off-screen and hidden tab', () => {
  it('leaving the viewport or hiding the tab stops the loop; returning restarts it', async () => {
    const h = await shown(widgetScript(), { fixture: WORKING });
    expect(h.queued()).toBe(1);
    await h.show(false);
    expect(h.queued()).toBe(0);
    await h.show(true);
    expect(h.queued()).toBe(1);
    h.visibility(true);
    expect(h.queued()).toBe(0);
    h.visibility(false);
    expect(h.queued()).toBe(1);
  });
  it('the loop keeps asking for frames while running', async () => {
    const h = await shown(widgetScript(), { fixture: WORKING });
    h.tick(1000);
    h.tick(1016);
    expect(h.stats.raf).toBe(3);
  });
});

describe('SW8 accessibility markup', () => {
  const section = () => /<section id="sea-hunter"[\s\S]*?<\/section>/.exec(html())![0];
  it('canvas has role=img and an aria-label; figcaption is polite and links the JSON', () => {
    const s = section();
    expect(s).toMatch(/<canvas\b[^>]*role="img"[^>]*aria-label="[^"]{20,}"/);
    expect(s).toMatch(
      /<figcaption aria-live="polite">[\s\S]*<a href="\/api\/v1\/fleet\/sea">[\s\S]*<\/figcaption>/,
    );
    expect(s).toContain('AI Fleet — Sea Hunter');
    expect(s).toMatch(/<button type="button" id="sh-pause"/);
  });
  it('the summary counts ships by state and external calls', async () => {
    const h = await shown(widgetScript(), { fixture: WORKING });
    expect(h.cap.textContent).toBe(
      'Ships: 1 working, 1 idle, 0 resting. External agents: 7 calls in the last 15 min.',
    );
  });
  it('canvas is 180-220 px high via CSS (mobile widths included)', () => {
    const h = /\.sh canvas\{[^}]*height:(\d+)px/.exec(html())!;
    expect(Number(h[1])).toBeGreaterThanOrEqual(180);
    expect(Number(h[1])).toBeLessThanOrEqual(220);
  });
});

describe('SW9 neutral vocabulary', () => {
  it('no internal system names in the widget JS, its inline copy or the page', () => {
    const bad = /taskloop|orchestra|autopilot|sentinel|torpedo/i;
    expect(SRC()).not.toMatch(bad);
    expect(widgetScript()).not.toMatch(bad);
    expect(html()).not.toMatch(bad);
  });
  it('only the five neutral classes are drawn', () => {
    expect(SRC()).toContain("['builder', 'scout', 'medic', 'writer', 'watch']");
  });
});
