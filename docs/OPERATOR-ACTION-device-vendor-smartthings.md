# Operator action needed -- SmartThings OAuth-In App (Ф5 device layer, new first vendor)

Filed 2026-09-02, replacing Tuya as the first device vendor (see
`docs/OPERATOR-ACTION-device-vendor-tuya.md`, status SUPERSEDED, for why). SmartThings has a real
web OAuth flow a non-OEM client can reach -- this is a manual-registration class of action (an
account/app registration under the operator's own identity, plus a pricing question only the
operator can decide to accept), not something to do autonomously. The routes and services this
plugs into (`device-connect.router.ts`, `device-connection.service.ts`, the safety layer, the
`device.*` MCP projection) are the same vendor-generic pieces built for Tuya, reused word for
word -- no new code shape is needed once these two actions are done.

Docs: https://developer.smartthings.com/docs/connected-services/oauth

## Two actions, exactly

### 1. Register an OAuth-In App in the SmartThings Developer Workspace, via their CLI

```
smartthings apps:create
```

When prompted:
- App type: OAuth-In app (web-hooks / API-connected, not a SmartApp-in-device-firmware type).
- Redirect URI: `https://apibase.pro/connect/device/smartthings/callback`
- Scopes: `r:devices:*` and `x:devices:*` (read device state, execute device commands -- the
  minimum pair `device.state`/`device.command` need; no broader scope requested).

The CLI issues a **Client ID** and **Client Secret** for the app on completion -- those are the
two values the executor needs handed over (never pasted into a chat that gets logged; same
handling as every other provider key in this project) once this step is done.

### 2. Email `partners@smartthings.com` asking for their commercial-tier pricing

**Why this is needed before writing any code against it:** the SmartThings API is free through
the end of Q3 2026; from October a paid tier structure starts. A $4.99/month personal tier has
been announced, but it is explicitly declared **non-commercial** -- APIbase reselling access to
these tools through paid MCP calls is a commercial use, so the personal tier does not apply and
the actual commercial price has not been published anywhere found. Ask directly what the
commercial rate is before committing SmartThings as the first vendor for real.

## What this pricing answer decides

This is a **precondition**, not paperwork: if the commercial rate comes back unaffordable at our
per-call price points, SmartThings does not become the first vendor after all -- **Netatmo** is
the named fallback in that case. Both actions above are useful regardless of the answer (the
OAuth app registration costs nothing and does not commit to anything), but do not treat "app
registered" as "vendor decided" until action 2's answer is in hand.

## What happens if this sits unanswered

Nothing breaks and nothing ships early: `device.*` tools already resolve to a clean 503 with no
vendor configured, `/connect` says nothing about devices, and no `device.*` tool appears in the
live catalog -- exactly the same convention every other un-provisioned adapter in this repo uses,
and it stays that way until a vendor is both registered AND price-cleared for real.
