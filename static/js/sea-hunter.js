(function () {
  var cv = document.getElementById('sh-cv');
  var cap = document.getElementById('sh-txt');
  var btn = document.getElementById('sh-pause');
  if (!cv || !cap || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  var URL_SEA = '/api/v1/fleet/sea';
  var CLASSES = ['builder', 'scout', 'medic', 'writer', 'watch'];
  var H = 200, W = 640, WORLD = 1024, ox = 0, lastT = 0;
  var data = null, sprites = null, raf = 0, timer = 0, lastFetch = 0, started = false;
  var inView = true, paused = false, reduced = false, drag = false, dragX = 0;

  function el(n) { return document.createElement(n); }

  // Offscreen silhouettes: tug, cruiser, submarine, lighthouse, small boat (builder..watch).
  function makeSprites() {
    var out = {};
    CLASSES.forEach(function (c, i) {
      var o = el('canvas'); o.width = 64; o.height = 40;
      var g = o.getContext('2d');
      g.fillStyle = '#02080c';
      g.beginPath();
      if (i === 0) { g.moveTo(4, 26); g.lineTo(60, 26); g.lineTo(52, 36); g.lineTo(10, 36); g.closePath(); g.fill(); g.fillRect(18, 14, 16, 12); g.fillRect(38, 6, 6, 20); }
      else if (i === 1) { g.moveTo(0, 24); g.lineTo(64, 24); g.lineTo(56, 36); g.lineTo(6, 36); g.closePath(); g.fill(); g.fillRect(14, 16, 36, 8); g.fillRect(24, 8, 10, 8); g.fillRect(40, 2, 3, 14); }
      else if (i === 2) { g.moveTo(2, 30); g.lineTo(8, 22); g.lineTo(56, 22); g.lineTo(62, 30); g.lineTo(56, 36); g.lineTo(8, 36); g.closePath(); g.fill(); g.fillRect(26, 12, 14, 10); g.fillRect(34, 4, 2, 8); }
      else if (i === 3) { g.moveTo(22, 38); g.lineTo(42, 38); g.lineTo(38, 12); g.lineTo(26, 12); g.closePath(); g.fill(); g.fillRect(24, 6, 16, 6); g.fillRect(30, 1, 4, 5); }
      else { g.moveTo(10, 28); g.lineTo(54, 28); g.lineTo(48, 36); g.lineTo(16, 36); g.closePath(); g.fill(); g.fillRect(28, 20, 12, 8); }
      out[c] = o;
    });
    return out;
  }

  function utc(iso) { return typeof iso === 'string' && iso.length >= 16 ? iso.slice(11, 16) : '--:--'; }

  function summary(d) {
    var n = { working: 0, idle: 0, resting: 0 };
    d.ships.forEach(function (s) { if (n[s.state] !== undefined) n[s.state]++; });
    var calls = d.external.calls;
    var counts = 'Ships: ' + n.working + ' working, ' + n.idle + ' idle, ' + n.resting + ' resting. External agents: ' +
      calls + ' call' + (calls === 1 ? '' : 's') + ' in the last ' + Math.round(d.external.window_s / 60) + ' min.';
    if (d.stale) return 'Telemetry stale';
    if (d.fleet_paused) return 'Fleet resting until ' + utc(d.paused_until_minute) + ' UTC. ' + counts;
    if (!d.ships.length && !calls) {
      var t = d.honesty.last_activity_at ? Date.parse(d.honesty.last_activity_at) : NaN;
      var s = 'Calm sea. No agents working right now.';
      return isNaN(t) ? s : s + ' Last activity ' + Math.max(0, Math.round((Date.now() - t) / 60000)) + ' min ago';
    }
    return counts;
  }

  function norm(j) {
    var e = j && j.external || {};
    return {
      stale: !j || j.stale === true,
      fleet_paused: !!(j && j.fleet_paused),
      paused_until_minute: j && j.paused_until_minute,
      ships: j && Array.isArray(j.ships) ? j.ships : [],
      external: { window_s: e.window_s || 900, calls: e.calls || 0, by_category: Array.isArray(e.by_category) ? e.by_category : [] },
      honesty: j && j.honesty || {}
    };
  }

  function clamp() { ox = Math.max(0, Math.min(WORLD - W, ox)); }

  function draw(t) {
    lastT = t;
    var d = data, hz = Math.round(H * 0.45), i;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#07121c'; ctx.fillRect(0, 0, W, hz);
    ctx.fillStyle = '#0a2a3a'; ctx.fillRect(0, hz, W, H - hz);
    ctx.strokeStyle = '#1d4a5c'; ctx.lineWidth = 1;
    for (i = 0; i < 5; i++) {
      ctx.beginPath();
      var y0 = hz + 14 + i * 24;
      for (var x = 0; x <= W; x += 16) { var yy = y0 + Math.sin((x + ox) / 30 + t * (1 + i * 0.2) + i) * 2; if (x) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); }
      ctx.stroke();
    }
    if (!d) return;
    var cats = d.external.by_category, best = null, bd = 31;
    cats.forEach(function (c, k) {
      var f = Math.min(1.5, 0.15 + (c.calls || 0) * 0.05), ph = (t * f + k * 0.37) % 1;
      var sx = ((k + 0.5) * WORLD / Math.max(cats.length, 1)) - ox, sy = hz + 60 + (k % 3) * 18;
      ctx.strokeStyle = 'rgba(80,220,160,' + (1 - ph).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(sx, sy, 3 + ph * 22, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = '#50dca0'; ctx.fillRect(sx - 1, sy - 1, 3, 3);
      ctx.font = '10px monospace'; ctx.fillText(String(c.category).slice(0, 24), sx + 6, sy + 3);
    });
    var n = Math.max(d.ships.length, 5);
    d.ships.forEach(function (s, k) {
      var sp = d.stale || s.state === 'resting' ? 0 : (s.activity_level || 0) * 12;
      var wx = ((k + 0.5) * WORLD / n + sp * t) % WORLD, sx = wx - ox, by = hz + 22 + (k % 2) * 14;
      var spr = sprites[s.class];
      if (!spr) return;
      if (s.state === 'resting') { ctx.fillStyle = '#3a2a1a'; ctx.fillRect(sx - 40, by + 14, 80, 4); }
      ctx.drawImage(spr, sx - 32, by - 2);
      if (s.state !== 'resting') { ctx.fillStyle = '#ffd24a'; ctx.fillRect(sx - 2, by + 14, 3, 3); }
      if (sp > 0) {
        for (var p = 0; p < s.activity_level; p++) {
          var ph = (t * 0.5 + p / 3) % 1;
          ctx.fillStyle = 'rgba(150,160,170,' + (0.7 - ph * 0.7).toFixed(2) + ')';
          ctx.beginPath(); ctx.arc(sx + 8 - ph * 10, by - 6 - ph * 22, 2 + ph * 4, 0, 6.2832); ctx.fill();
        }
      }
      var dx = Math.abs(sx - W / 2);
      if (dx < bd) { bd = dx; best = s; }
    });
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 12); ctx.fillRect(0, H - 12, W, 12);
    ctx.strokeStyle = '#33ff66'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 14, H / 2); ctx.lineTo(W / 2 + 14, H / 2); ctx.moveTo(W / 2, H / 2 - 14); ctx.lineTo(W / 2, H / 2 + 14); ctx.stroke();
    if (best) { ctx.fillStyle = '#33ff66'; ctx.font = '12px monospace'; ctx.fillText(best.class + ' - ' + best.state, W / 2 + 18, H / 2 - 8); }
  }

  function moving() {
    var d = data;
    return !!d && !d.stale && d.ships.some(function (s) { return s.state !== 'resting' && s.activity_level > 0; }) ||
      !!d && !d.stale && d.external.by_category.length > 0;
  }

  function frame(ts) {
    raf = 0;
    draw(ts / 1000);
    sync();
  }

  function sync() {
    var run = started && inView && !document.hidden && !paused && !reduced && moving();
    if (run && !raf) raf = requestAnimationFrame(frame);
    if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    var poll = started && inView && !document.hidden;
    if (poll && !timer) {
      var wait = Math.max(0, 10000 - (Date.now() - lastFetch));
      timer = setTimeout(load, wait);
    }
    if (!poll && timer) { clearTimeout(timer); timer = 0; }
  }

  function apply(j) {
    data = norm(j);
    cap.textContent = summary(data);
    if (!raf) draw(lastT);
    sync();
  }

  function load() {
    timer = 0;
    lastFetch = Date.now();
    fetch(URL_SEA, { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(apply, function () { apply(null); });
  }

  function init() {
    if (started) return;
    started = true;
    sprites = makeSprites();
    W = Math.round(cv.clientWidth) || 640;
    cv.width = W; cv.height = H;
    WORLD = Math.max(W * 1.6, 800);
    clamp();
    load();
  }

  function wire() {
    var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced = !!(mq && mq.matches);
    if (reduced && btn) btn.hidden = true;
    if (btn) btn.addEventListener('click', function () {
      paused = !paused;
      btn.textContent = paused ? 'Resume' : 'Pause';
      btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      sync();
    });
    document.addEventListener('visibilitychange', function () { if (started) sync(); });
    cv.addEventListener('pointerdown', function (e) { drag = true; dragX = e.clientX; });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      ox -= e.clientX - dragX; dragX = e.clientX; clamp();
      if (!raf && data) draw(lastT);
    });
    var end = function () { drag = false; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', end);
    if (typeof IntersectionObserver === 'function') {
      inView = false;
      new IntersectionObserver(function (es) {
        inView = es[es.length - 1].isIntersecting;
        if (inView) init();
        if (started) sync();
      }).observe(cv);
    } else init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
