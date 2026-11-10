# API credits (API-CREDITS-1108)

Fleet tooling for the Anthropic API credit balance: $200 per cycle, org "Poly's Individual Org", no auto-reload.
Cycle 2026-11-08 -> 2026-12-06 (end exclusive), then from the 6th 00:00 UTC each month. Until the reset moment and timezone are
confirmed in Console on 2026-12-06, treat 2026-12-05 23:59 UTC as the end.

The wrapper `api-call` is the only process in the fleet allowed to set the API credential. Nothing else may.

## Lanes and caps

All numbers live in `config/api-credits.json`.

| Lane | Use | Cycle cap | Allowed models |
|---|---|---|---|
| overflow | Fable acceptance reviews after real limit text; also $8/day | $45 | `claude-fable-5-1` |
| demo | one outside-buyer run per day | $30 | `claude-sonnet-5-5` |
| batch | async batch work | $55 | `claude-haiku-5-5`, `claude-sonnet-5-5` |
| sweep | idempotent end-of-cycle work | $50 | `claude-haiku-5-5`, `claude-sonnet-5-5` |

Soft total $180 (sum of lane caps). Alerts at total $90, $135, $162 and at 90% of any lane. Above $162 only overflow may call.
Leaving up to $40 unused per cycle is correct.

## Install the key

`scripts/api-credits/api-key-install` reads the key from stdin silently, writes `~/.anthropic-api.env` mode 0600 (umask 077) and
prints only `installed`. The file name matches no `.env` loader pattern; never source it.

## Wrapper CLI

```
api-call --lane {overflow|demo|batch|sweep} --model <id> --max-turns N [-- claude -p args]
```

Prints the result text on stdout. Runs `claude -p --output-format json --model <id> --max-turns N` with the key in the child
environment only. Callers cannot pass `--output-format`, `--model` or `--max-turns` after `--`, in either the `--flag value` or the `--flag=value` form.

Exit 75 means refused (one line on stderr, no child process, no network call). A refusal is never an error: the caller falls back to
subscription behaviour. Other non-zero codes are call failures. Refusal reasons, in check order:

1. key file missing, not mode 0600, not owned by the caller, or without a credential
2. unknown lane, or model not on the lane allowlist
3. `--max-turns` missing (defaults: overflow 1, demo 12)
4. `api-ledger/HALT` or any `api-ledger/HALT-*` present (all lanes except overflow)
5. `api-ledger/cycle.json` missing, or now outside the cycle window
6. lane cap reached; overflow today's total >= $8; total ledger >= $162 (non-overflow lanes)
7. `api-batch` only: the batch estimate is at or above the per-batch cap (`per_unit_caps`, $5 for batch and sweep): `batch estimate $X over the $5 cap`

Other commands: `api-spend` (per-lane and total, days left, projected end-of-cycle; `api-spend --fleet` on apibase prints per tenant,
per lane and the fleet total), `api-spend-cron [tick.log]` (hourly; writes `api-ledger/ALERT-90|135|162|lane-<lane>` once each and a
tick.log line; on apibase the 90/135/162 markers use the fleet total), `api-cycle-rollover` (cron `5 0 6 * *` UTC; opens the next
cycle, clears ALERT markers).

## Batch lane

Eligible jobs: a template prompt, at least 1 h latency tolerance, nobody waiting on the answer. Lanes `batch` and `sweep` only,
through the Message Batches API at the 50% batch price.

```
api-batch {estimate|submit|poll|collect} --lane {batch|sweep} --model <id> --jobs <requests.jsonl> [--out <results.jsonl>] [--batch-id <id>]
```

`requests.jsonl` holds one Messages request per line with a `custom_id` (the caller's item id, `[A-Za-z0-9_-]{1,64}`, never prompt
text): `{"custom_id": "...", "params": {"max_tokens": N, "messages": [...]}}`. Every subcommand runs the same guards as `api-call`
(refusal reasons above, exit 75, nothing sent). Estimate rule: sum(input characters / 3) x input batch price + sum(`max_tokens`) x
output batch price; an estimate at or above the per-batch cap exits 75 before any network call.

- `submit` posts the batch, prints the batch id and appends a ledger row `kind: "estimate"` (`lane, model, batch_id, cost_usd` = the
  estimate, `n_requests`).
- `poll` prints the processing status. `collect` needs `--out`, downloads the results (one line per result, `custom_id` preserved),
  and appends one row `kind: "actual"` (`batch_id`, summed usage, `cost_usd` at the batch rate, `n_results`); it writes nowhere else
  and exits 3 while the batch has not ended. A second `collect` of the same batch adds no second row.
- Metering: an `estimate` row counts only while no `actual` row with the same `batch_id` exists, so a batch that is never collected
  stays charged at its estimate. Rows without `kind` (`api-call`) count as before.

## Pricing table

`config/api-credits.json` keys `pricing` (USD per MTok: `input, output, cache_read, cache_write`; Haiku carries a `long` tier for
prompts over 100k tokens), `batch_discount` (0.5), `pricing_source` (https://platform.claude.com/docs/en/about-claude/pricing) and
`pricing_as_of` (2026-11-09). `anthropic_version` is pinned in the same file. A price change is a config edit with a new as-of date.

## Per-tenant layout

Each tenant (`tenants` in the config: apibase, cryptocardhub, sales) runs its own copy in `~/bin/api-credits/` with its own key file,
ledger and cycle. A copy finds `api-credits.json` next to itself first, then in the repo; the ledger `tenant` field defaults to the
basename of `$HOME`. The dispatcher installs or refreshes a copy on apibase with `scripts/api-credits/install-tenant-copy.sh <tenant>`
(copies `api-call, api-batch, api-spend, api-key-install, api-cycle-rollover, api_credits.py, api-credits.json`, owner `<tenant>`,
keeps `<name>.bak-pre-0746-<UTC>`, compiles, prints the md5 of every file). Keys are named `<tenant>-<lane>` in Console.

On apibase `api-spend-cron` also reads every tenant's ledger and, at a fleet total of $162 or more, writes `api-ledger/HALT-fleet-total`
into every tenant; `api-cycle-rollover` removes `HALT-fleet-total` everywhere and never a plain `HALT`. It compares the md5 of each
tenant copy with the repo and writes `api-ledger/DRIFT-<tenant>` plus one tick.log line on a mismatch.

## Ledger format

One ledger per tenant, plus a fleet view on apibase (`api-spend --fleet`). Directory `~/api-ledger` (override `API_LEDGER_DIR`).
`cycle.json` holds `{"start","end"}`; calls append to `<cycle-start>.jsonl`, one JSON object per call: `ts, tenant, lane, model,
input_tokens, output_tokens, cache_read, cache_write, cost_usd, request_id`. `cost_usd` is `total_cost_usd` from `claude -p`. Batch rows
are described under Batch lane. The ledger never holds the key, prompt text or a `custom_id`.

## Revocation procedure

1. In Console, revoke the lane's key (keys are named `<tenant>-<lane>`).
2. Delete `~/.anthropic-api.env` on the tenant; `api-call` then refuses with exit 75.
3. To stop all lanes but overflow immediately, `touch ~/api-ledger/HALT`; remove it once explained.
4. Daily check: `grep -l` for the credential variable across `~/.env`, `~/*/.env`, `~/.claude/*.env` must print nothing.
5. Install a replacement with `api-key-install`.

## overflow plug-in: ~/taskloop/taskloop.sh:claude_print

Every headless `claude --print` call passes the shared guard `~/taskloop/lib/api-key-guard.sh`: the wrapper `~/bin/claude` (any `--print` or `-p` call, rc 78 on refusal or
when the helper is missing) and the direct sites (`fable-arbiter.sh`, `auth-preflight.sh`, the night-orchestra run/review/supervisor calls, `layer3_review.py`, `email-intake.py`).
Only the `api-call` child carries the key (`API_CALL_CHILD=1`). In the tick, `claude_print` runs the executor, review, dispute and repair calls and the preflight ping
(`auth_preflight_gate`, haiku, only on EXPIRED or an hour-old UNKNOWN) runs through the same gate; the per-model counter
`state/passes-<date>.<label>` is written by `count_model_call` right after it. The logic lives in `scripts/api-credits/overflow.sh`,
sourced by `taskloop.sh`.

- Key-unset assertion: before every headless call, `api_key_guard` (one definition, `lib/api-key-guard.sh`, sourced by `overflow.sh`) checks that `ANTHROPIC_API_KEY` and
  `ANTHROPIC_AUTH_TOKEN` are unset (or `API_CALL_CHILD=1`). If one is set, no claude call is made, `logs/api-key-guard.log` gets one line with the variable name (never the value),
  Telegram is told at most once per hour, and the site aborts (the tick logs `API key present in OAuth path — tick aborted` and exits). `tests/api-key-guard-coverage.test.sh` fails on any `claude --print` site without the guard.
- Fable acceptance overflow: right after the acceptance review call, when the answer is a limit hit (no verdict, at most 5 non-empty lines, matching `hit your session limit` or
  `weekly limit`; a full review that merely mentions the phrase is never overflowed), `api_overflow_run` re-runs the identical prompt once per card through
  `api-call --lane overflow --model claude-fable-5-1 --max-turns 1`. On success the answer is the acceptance answer and
  `state/passes-<date>.fable.api` is incremented; on exit 75 or any failure nothing changes and the card-0590 outage branch
  (host-wide marker, park) runs as before. Sonnet work passes and dispatcher calls are never overflowed.

Test: `tests/bash/api-overflow.test.sh`.

## Tests

`tests/bash/api-credits.test.sh` (fake claude binary and a fake Batches endpoint on loopback, strace proves no child process or outbound
connect on refusal; the suite re-runs itself from an installed tenant copy).
