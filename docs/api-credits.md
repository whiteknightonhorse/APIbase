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
environment only. Callers cannot pass `--output-format`, `--model` or `--max-turns` after `--`.

Exit 75 means refused (one line on stderr, no child process, no network call). A refusal is never an error: the caller falls back to
subscription behaviour. Other non-zero codes are call failures. Refusal reasons, in check order:

1. key file missing, not mode 0600, not owned by the caller, or without a credential
2. unknown lane, or model not on the lane allowlist
3. `--max-turns` missing (defaults: overflow 1, demo 12)
4. `api-ledger/HALT` present (all lanes except overflow)
5. `api-ledger/cycle.json` missing, or now outside the cycle window
6. lane cap reached; overflow today's total >= $8; total ledger >= $162 (non-overflow lanes)

Other commands: `api-spend` (per-lane and total, days left, projected end-of-cycle), `api-spend-cron [tick.log]` (hourly; writes
`api-ledger/ALERT-90|135|162|lane-<lane>` once each and a tick.log line), `api-cycle-rollover` (cron `5 0 6 * *` UTC; opens the next
cycle, clears ALERT markers).

## Ledger format

Directory `~/api-ledger` (override `API_LEDGER_DIR`). `cycle.json` holds `{"start","end"}`; calls append to `<cycle-start>.jsonl`, one
JSON object per call: `ts, tenant, lane, model, input_tokens, output_tokens, cache_read, cache_write, cost_usd, request_id`.
`cost_usd` is `total_cost_usd` from `claude -p`. The ledger never holds the key or prompt text.

## Revocation procedure

1. In Console, revoke the lane's key (keys are named `<tenant>-<lane>`).
2. Delete `~/.anthropic-api.env` on the tenant; `api-call` then refuses with exit 75.
3. To stop all lanes but overflow immediately, `touch ~/api-ledger/HALT`; remove it once explained.
4. Daily check: `grep -l` for the credential variable across `~/.env`, `~/*/.env`, `~/.claude/*.env` must print nothing.
5. Install a replacement with `api-key-install`.

## Tests

`tests/bash/api-credits.test.sh` (fake claude binary, strace proves no child process on refusal).
