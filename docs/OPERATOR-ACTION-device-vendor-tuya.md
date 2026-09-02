# Operator action -- Tuya IoT Cloud Project (Ф5 device layer)

## ⛔ STATUS: SUPERSEDED, 2026-09-02 -- do not act on this document

This document used to ask the operator to register a Tuya IoT Development Platform account and
enable "Authorization Management" OAuth. **Do not do that registration.** Fable's final ruling on
the device-vendor program removed Tuya from first place and froze the Tuya code
(`src/adapters/device-tuya/`) rather than finishing it. The console setting this document used to
point at (an approved "Authorization Management" subscription that unlocks account-linking OAuth
for a plain web client) **does not exist for a non-OEM project** -- following the old steps below
would run into a wall Tuya puts up on purpose, not a review queue that eventually clears.

## Why: the OEM wall

Tuya's "Link Tuya App Account" OAuth flow -- the one that would let an end user link their own
Tuya account to us without giving us their password -- is reachable only through an **OEM
application**, a product Tuya sells. And buying it would not even get us what this integration
was built for: the end user would be logging into and authorizing **our OEM app's own Tuya
account**, not their own Smart Life / Tuya Smart app account, which is exactly the assumption
`device-connect.router.ts`'s connect-webview flow was built on. There is no cheaper or faster path
found to plain web OAuth for a project of our shape.

## What is frozen, not deleted

`src/adapters/device-tuya/tuya-client.ts` and `index.ts` carry the full technical reasoning at the
top of each file (two concrete unresolved defects: the request-signing formula is outdated and
would fail every real call, and token refresh is not safe under concurrent callers) plus the
resume condition below. The vendor-generic pieces this project built around Tuya --
`device-connect.router.ts`'s routes, `device-connection.service.ts`, the safety layer, and the
`device.*` MCP projection -- are **not** Tuya-specific and are being reused, word for word, for
SmartThings (see `docs/OPERATOR-ACTION-device-vendor-smartthings.md`), the new first vendor.

## Resume condition -- act on Tuya again only if ONE of these becomes true

1. Tuya opens OAuth account-linking to non-OEM / plain web clients, or
2. Tuya publishes a real API for generating the "Link Tuya App Account" QR code that an admin
   currently has to generate by hand in the console (no such API was found), or
3. the operator makes an informed, deliberate decision to buy the OEM application as a product,
   understanding point 2 above (it authorizes our app's Tuya account, not the end user's).

None of these is true today. Nothing on the live site or in `.env` references Tuya as available --
`device.*` tools resolve to a clean 503 with no `TUYA_CLIENT_ID` set, same as any other
un-provisioned adapter, and that gate stays in place until one of the three conditions above.
