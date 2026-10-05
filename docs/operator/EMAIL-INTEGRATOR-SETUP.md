# Integrator mail setup (T-INT-18)

Merchant mail is sent by `scripts/autopilot/merchant-mail.py` (hourly cron candidate, **not installed**)
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
   takes the key from that contour and never from the process environment.
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
| Resend `GET /domains` shows `apibase.pro` = `verified` | rows `reason='domain_unverified'`, nothing sent | 2 |

## Reading the report (stdout)

- `merchant-mail: HOLD — ... ruling_missing` — waiting for the dispatcher's approval file.
- `merchant-mail: STOP — Resend domain apibase.pro is not 'verified'` — steps 1–3 are not finished; this is
  the "stop and report" decision of 2026-10-05.
- `merchant-mail: OK sent=N requeued=M failed=K` — `sent`: `status='sent'`, `provider_message_id` stored;
  `requeued`: Resend error, `attempts+1`, retried after one hour; `failed`: the 24th failure,
  `status='failed'`, which `incident-engine.py` turns into a WEBHOOK_FAILED incident for `merchant:<id>`.

Logs hold `msg_id`, `merchant_id`, `kind`, `status` only — never an address or a letter body.
Language is always `en`; the `*.ru.md` templates are for a manual reply by the dispatcher.
