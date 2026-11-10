# Integrator mail setup (T-INT-18)

Merchant mail is sent by `scripts/autopilot/merchant-mail.py` (hourly cron at :15 with `--send`; without the flag the script only reports, log `logs/merchant-mail.log`)
from `integrator@apibase.pro` through Resend. Replies are read by `email-intake.py` (class `MERCHANT_REPLY`).
No letter leaves until every step below is done.

## Operator steps

1. **Resend domain.** In the Resend dashboard add the domain `apibase.pro` and publish the DNS records it
   shows (DKIM CNAME/TXT, the return-path MX/TXT). Wait until the domain status is `verified`.
2. **SPF.** The apex TXT must include Resend's sender (as Resend shows it) in the one existing SPF record —
   never add a second `v=spf1` record.
3. **DMARC.** Publish `_dmarc.apibase.pro` TXT, e.g. `v=DMARC1; p=none; rua=mailto:integrator@apibase.pro`;
   tighten the policy only after reports are clean.
4. **Resend key.** The `resend` provider must already be connected through `connected_db.py`. The script
   takes the key from that contour and never from the process environment. A sending-only key is enough and is the one the fleet holds; no full-access key is created for this script.
5. **IMAP for `integrator@apibase.pro`.** Create the mailbox, enable IMAP, and give the dispatcher the host,
   user and an app password. `email-intake.py` reads its mailbox from `AUTOPILOT_IMAP_ENV_PATH`
   (default `~/.config/autopilot/imap.env`, today the Gmail box); switching to `integrator@` is a change of
   that file by the dispatcher, after IMAP works. Nothing else in the cascade changes.
6. **Template ruling (dispatcher, not operator).** Fable's ruling
   `disputes/<n>-merchant-mail-templates.ruling-1.md` must exist; then the dispatcher writes
   `config/integrator/mail-approval.json` =
   `{"ruling": "disputes/<n>-merchant-mail-templates.ruling-1.md", "approved_at": "<ISO date>"}`.

## What the script checks (in this order)

| Gate | Failing result | Exit |
|---|---|---|
| `mail-approval.json` present with `ruling` and `approved_at` | every queued row keeps `status='queued'`, `reason='ruling_missing'`; Resend not called | 0 |
| Resend key via `connected_db.py` | rows `reason='key_missing'` | 3 |
| Resend `GET /domains` shows `apibase.pro` = `verified`; with a sending-only key (401 `restricted_api_key`) the status cannot be read and the first send is the gate: a 403 "domain is not verified" answer | rows `reason='domain_unverified'`, nothing delivered, exit 2 | 2 |

## Reading the report (stdout)

- `merchant-mail: HOLD — ... ruling_missing` — waiting for the dispatcher's approval file.
- `merchant-mail: STOP — Resend domain apibase.pro is not 'verified'` — steps 1–3 are not finished; this is
  the "stop and report" decision of 2026-10-05.
- `merchant-mail: STOP — Resend refused the send: domain apibase.pro is not verified` — same meaning and same operator steps as the line above.
- `merchant-mail: DRY-RUN ...` — no flag given; nothing sent, nothing written.
- `merchant-mail: OK sent=N requeued=M failed=K skipped=S` — `sent`: `status='sent'`, `provider_message_id` stored;
  `requeued`: Resend error or database error, `attempts+1`, retried after one hour; `failed`: the 24th
  failure, or a Resend 422 (final after one attempt), `status='failed'`, which `incident-engine.py` turns
  into a WEBHOOK_FAILED incident for `merchant:<id>`.
- `skipped` — rows never sent on purpose: operational notice older than 7 days (`stale_7d`), legal version
  already in force (`in_force`), merchant or contact e-mail missing (`merchant_missing`), condition no longer
  true (`resolved`), a pii mail already sent to this merchant in the last 7 days (`digest_7d`); a skipped row
  never opens an incident.

## Schedule line

```
15 * * * * cd /home/apibase/apibase-fleet && set -a && . /home/apibase/apibase/.env && set +a && /usr/bin/python3 scripts/autopilot/merchant-mail.py --send >> /home/apibase/apibase-fleet/logs/merchant-mail.log 2>&1
```

Install it only after the dispatcher confirms the routing card (0754) is live.

Logs hold `msg_id`, `merchant_id`, `kind`, `status` only — never an address or a letter body.
Language is always `en`; the `*.ru.md` templates are for a manual reply by the dispatcher.
