# Ф5 -- Physical-Device MCP Layer

Status: design covers the full 42-class catalog; execution this cycle implements T1 only,
through one vendor cloud (Tuya OAuth). Written 2026-09-02.

## 0. The goal, and the puzzle it had to solve

The operator's brief: not a set of one-off device integrations, but a layer where **any
device with a programmable interface** becomes an MCP tool the agent can call. The puzzle
named explicitly: how does a user link *their own* device (the example given: an air
conditioner) without APIbase ever holding that user's vendor password.

**Answer (industry standard, already decided by Fable -- not re-litigated here): OAuth 2.0
authorization-code, cloud-to-cloud account linking**, with our own hosted Connect-webview on
top (the pattern Seam/Enode/Smartcar/Alexa/Google Home all use). The user's password is typed
exactly once, on the *vendor's own* login page. We store only the access/refresh tokens the
vendor issues after that consent, encrypted at rest, and we rotate them ourselves. We never
hold a device password under any fallback path -- a vendor with no OAuth is simply not onboarded
in this first wave, because "store the account credentials directly" is precisely the thing
every other vendor's OAuth exists to avoid, and it is the one place a competing solution might
cut this corner and we are instructed not to.

Matter's own multi-admin model needs a *local* controller (a hub inside the user's LAN) --
a cloud service structurally cannot join a Matter fabric the way a phone or Home Assistant can.
Noted as a real future bridge (issue a scoped Home Assistant long-lived token, talk to
Home Assistant's REST/WebSocket API, let *it* speak Matter/Zigbee/Z-Wave to the actual hardware)
-- not attempted this cycle, listed here so it is not silently forgotten.

## 1. Device descriptor

One shape for every device class, whether wired up or not (see `config/device-classes.json`,
the literal machine-readable version of this table):

```
{
  class: string,                 // e.g. "thermostat_ac"
  tier: "T1" | "T2" | "T3" | "T4",
  capabilities: string[],        // subset of the operation vocabulary, §3
  state_schema: object,          // the DP/attribute shape get_state returns
  limits: { rate_cap_per_min: number },
  safety: {
    confirm_required: boolean,   // command must carry confirm:true
    bounds: { [command]: { min, max } }  // numeric setpoints only
  }
}
```

Calibration fields (`bounds`, `rate_cap_per_min`, `confirm_required`) are **data, not code** --
`config/device-classes.json` is read at call time by `device-safety.service.ts`. The operator
can retune a temperature ceiling without a deploy; nothing about a bound is hardcoded in an
adapter.

## 2. Connect-webview

```
Agent (Bearer api_key)                 APIbase                          Vendor (Tuya)
   |--- POST /connect/device/tuya/start -->|                                  |
   |<-- { connection_id, authorize_url } --|  (pending row, random state)     |
   |                                        |                                  |
   [hands authorize_url to a human, opened in a REAL browser]
   human -------------------------------------------------------------> vendor login page
   human logs into THEIR OWN Tuya account (we never see this password) -> consents
   vendor --- redirect: GET /connect/device/tuya/callback?code&state ->| (browser hop, no Bearer)
   |                                        |--- exchange code for tokens (server-side) --->|
   |                                        |<-- access_token, refresh_token, uid ----------|
   |                                        |  encrypt (AES-256-GCM), store, mark active     |
   |<---------------- human sees a plain "linked" page ------------------|
   |--- GET /connect/device/connections -->|  (Bearer, lists this agent's own connections)
   |--- POST /connect/device/:id/revoke -->|  (Bearer, wipes ciphertext, not just a flag)
```

The callback is deliberately unauthenticated (a browser redirect carries no API key) --
ownership and CSRF protection are both carried by `state`: a random 256-bit, single-use,
10-minute-TTL token minted at `start` and bound to the initiating agent server-side
(`device-connection.service.ts`). This is the same shape Google/GitHub/every RFC 6749
implementation uses for its own callback, not a new pattern.

## 3. MCP projection

Three generic tools sit in front of every vendor: **`device.list`**, **`device.state`**,
**`device.command`** (mapped to MCP names `device.registry.{list,state,command}`). A second
vendor is a new `case` inside the one `DeviceAdapter` (`src/adapters/device-tuya/index.ts`),
never a new tool_id and never a pipeline change -- that indirection is the entire point of a
device *layer* instead of one adapter per vendor.

The wider operation vocabulary the assignment names (discover, get_state, get_capabilities,
read, write, execute, stop, reset, health, emergency_stop) maps onto this projection as
**verbs a class's `capabilities[]` array declares it supports**, not as ten separate tool_ids:
`device.list` = discover; `device.state` = get_state/read/get_capabilities/health; `device.command`
= write/execute/stop/reset/emergency_stop, distinguished by which DP `code` the caller sends
(a T2 valve's `emergency_stop` capability is just its `valve_open=false` command, gated by
`confirm_required`). Collapsing the vocabulary onto 3 tool_ids instead of minting a tool per verb
per class is deliberate: 42 classes x ~6 verbs each would be 250+ tool_ids for what is, from the
pipeline's point of view, always "read a DP" or "write a DP" against an already-owned connection.

## 4. Safety layer

Two independent mechanisms, both already load-bearing before this project existed, reused
rather than reinvented:

- **MODERATION (action-class)**: `config/content-moderation-classes.json` now lists `device`
  in its `action` array -- the same full-ruleset content check `telegram`/`twilio`/`telnyx`/
  `resend` get, since `device.command` "acts on the real world on the agent's behalf" exactly
  like those four. One line, one place (`§12.43 MODERATION`, already in the pipeline before
  this project touched it).
- **Calibration gate (new this cycle)**: `device-safety.service.ts`, run inside the adapter
  before any vendor call. `confirm_required` (per class) demands a literal `confirm:true` on
  the call; numeric `bounds` (per class, per command) reject an out-of-range setpoint outright
  -- never silently clamped. Both fail closed (`DeviceSafetyViolation` -> HTTP 422). An unknown
  class or an unbounded command is a **disclosed gap**, not a silent allow-everything: it simply
  means no class-specific rule exists yet for that shape, same posture the moderation-classes
  file itself documents for an unclassified provider.

**A real cross-tenant bug this design surfaced and fixed, not merely worked around**:
`cache.stage.ts`'s shared cache is keyed by `(toolId, params)` with **no agent_id** -- correct
for the 372 existing adapters (all public data, sharing the cache is the point) but a genuine
leak risk for the first per-agent-private tool class: a cache hit skips `PROVIDER_CALL`
entirely, which is also where the adapter's per-agent ownership check lives. `device.*` tools
now bypass the shared cache and single-flight lock outright (`AGENT_SCOPED_TOOL_PREFIXES`) --
fixed in the one shared stage, not worked around per-adapter.

## 5. Tier matrix (42 classes, T1 16 / T2 12 / T3 10 / T4 4)

Full machine-readable table: `config/device-classes.json`. Inclusion criteria per tier (also in
that file's `tiers` object):

| Tier | What qualifies | Default posture |
|---|---|---|
| **T1** Ambient | Fully reversible in seconds, no access/privacy function, mass consumer OAuth cloud exists | `confirm_required:false`, generous rate cap |
| **T2** Security/access/consumable | Locks, cameras, valves, feeders -- wrong command stops being free of consequence | `confirm_required:true` always |
| **T3** Financial/energy | Real dollar cost per command (EV/battery/grid/heater); relies on the vendor's OWN certified hardware interlock as the last line of defense | `confirm_required:true` + mandatory numeric bounds |
| **T4** Mobility/industrial/lab | Can cause physical injury via autonomous motion; normally a certified-integrator SDK, not a consumer OAuth app | **Published as UNVERIFIED, descriptor-only** -- no hardware, no vendor account, never claimed working |

## 6. What is actually EXECUTED this cycle vs. designed-only

- **Executed, tested (mocked Tuya HTTP + in-memory Prisma), NOT live-network-verified**:
  connect-webview start/callback, AES-256-GCM token storage, ownership/IDOR checks, the
  safety-bounds/confirm gate, the cache-bypass fix, revoke-wipes-ciphertext, and the full
  T1 narrative (list -> state -> command -> revoke) for Tuya smart plugs / lights / AC.
  See `tests/integration/device-connect-e2e.test.ts` and `tests/unit/adapters/tuya-client.test.ts`
  for exactly what each proves and what it explicitly does not.
- **Blocked on an operator action, not on code**: a live round-trip against the real Tuya
  cloud needs `TUYA_CLIENT_ID`/`TUYA_CLIENT_SECRET`/`TUYA_API_BASE_URL`/`TUYA_AUTHORIZE_URL`,
  which require the operator to register a Tuya IoT Cloud Project -- see
  `docs/OPERATOR-ACTION-device-vendor-tuya.md`. Until those env vars are set, `device.*` calls
  resolve to a clean 503 (`resolveAdapter` returns the adapter, but `callVendor` reports Tuya
  "not configured" -- same convention every other un-provisioned adapter in this repo uses).
- **Not started this cycle**: SmartThings, Aqara (next per the operator's stated order), and
  every T2/T3/T4 class beyond the descriptor row. Paid aggregators (Enode/Smartcar/Seam) are
  deliberately not purchased (operator default: not spending yet).
- **Not touched**: `static/*.html` (another executor's redesign is in flight there this
  phase) and homepage/`server-card.json`/`mcp.json` tool-count propagation for these 3 new
  tool_ids -- left stale on purpose rather than half-syncing counts the way the Ф6 redesign
  cycle's own bug report shows can go wrong; a follow-up count-sync pass should include these
  3 tool_ids the next time that maintenance runs.
