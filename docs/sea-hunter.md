# Sea Hunter: the public fleet view

`GET /api/v1/fleet/sea` shows a neutral picture of the working fleet. The data comes from
`scripts/sea-fleet-export.py` (every minute, Redis key `fleet:sea`, TTL 180 s). The route
(`src/routes/fleet-sea.router.ts`) serves it with `Cache-Control: public, max-age=10, s-maxage=10`,
a 15 s Redis response cache and 60 requests/min/IP.

## The "door" convention

Any agent can appear as a ship by writing `~/fleet/heartbeat/<agent-id>.json`:

```json
{"class": "scout", "state": "working", "started_at": 1790000000}
```

- `class` must be one of `builder`, `scout`, `medic`, `writer`, `watch`. Any other class
  (including internal system names) is ignored.
- `state` is `working`, `idle` or `resting`; anything else counts as `idle`.
- `started_at` is epoch seconds. The file mtime drives `activity_level`.
- The ship id is `<class>-<n>` in file-name order. The agent-id is never published.

## What is published

`generated_at`, `fleet_paused`, `paused_until_minute` (rounded to the minute, only while paused),
`stale`, `ships[{id, class, state, since_s, activity_level 0..3}]`,
`external{window_s 900, calls, agents_bucket "0"|"1-5"|"6-20"|"21+", by_category[{category, calls}]}`,
`honesty{last_activity_at}`.

Honesty rules: a `generated_at` older than 120 s makes `stale: true` and no ship is `working`;
a missing key gives `stale: true` and `ships: []`; while paused every ship is `resting`.

## What is forbidden

Task names, provider names, tool ids, wallets, tenant names, file paths, internal system names
and the pause reason or author. The exporter reads only the first line of the pause file, counts
(never lists) the active task directory, and reads mtimes. The mapping from internal systems to
the neutral classes lives only in `scripts/sea-fleet-export.py`. The serializer
(`src/services/fleet-sea.service.ts`) is a whitelist: any field not picked explicitly is dropped.

## The home page widget (T-INT-30)

`static/js/sea-hunter.js` is the readable source. `node scripts/inline-sea-hunter.cjs` minifies it
and inlines it into `<section id="sea-hunter">` of `static/index.html` (`--check` fails on drift;
tests/unit/sea-hunter.test.ts enforces it). The widget fetches only `/api/v1/fleet/sea`, every 10 s,
and only while it is in view and the tab is visible. Canvas 2D, offscreen silhouettes, no libraries.
Stale data shows "Telemetry stale" and stops the animation; `prefers-reduced-motion` gets one static frame.
