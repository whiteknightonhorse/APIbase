# Operator action needed -- Tuya IoT Cloud Project (Ф5 device layer)

Filed 2026-09-02. This is a manual-registration class of action (like a vendor API key) that
an agent should not perform autonomously: it requires the operator's own identity/email/business
context and accepting Tuya's own terms. Code is already built and tested (mocked) to consume
whatever comes out of this -- see `docs/09-device-mcp-layer.md`.

## Why this can't be done by the agent

Tuya's OAuth "Link Tuya App Account" flow (the one that lets an end user link their own Tuya
account without giving us their password) requires a **Tuya IoT Development Platform account**
and, for the account-linking capability specifically, an **"Authorization Management" service
subscription that Tuya's own team reviews before it works for real end users** -- this is the
"OAuth requires app verification, can take real time" case the operator's brief anticipated.
Registering it needs a real business identity, not something to create on the operator's behalf.

## Steps (operator, ~15-30 min to submit + a wait for Tuya's review)

1. Register a free account at **iot.tuya.com** (Tuya IoT Development Platform).
2. Create a **Cloud Project** -> Development Method: "Smart Home" (the PaaS project type that
   supports third-party account linking, not "Custom" / "Industry").
3. In the project's **Service API** tab, subscribe to (at minimum): IoT Core, Authorization
   Management, Smart Home Basic Service.
4. Note the project's **Access ID (`client_id`)** and **Access Secret (`client_secret`)**, and
   which **data center** the project was created in (e.g. Western America -> `openapi.tuyaus.com`,
   Central Europe -> `openapi.tuyaeu.com`, China -> `openapi.tuyacn.com`). This determines
   `TUYA_API_BASE_URL`.
5. In the project's **Authorization Management** (or "App Account" linking) settings, enable
   **OAuth 2.0 Authorization** and set the callback/redirect URL to:
   `https://apibase.pro/connect/device/tuya/callback`
   Tuya's console will show a data-center-specific authorization page URL once this is approved
   -- that full URL is `TUYA_AUTHORIZE_URL`.
6. **This step is the one that can take real time** (Tuya's own review of the Authorization
   Management subscription for a new project). Submit it and move on -- do not block other work
   waiting on it.
7. Once approved, set these on the server (`.env`, then restart the API container):
   ```
   TUYA_CLIENT_ID=<Access ID>
   TUYA_CLIENT_SECRET=<Access Secret>
   TUYA_API_BASE_URL=https://openapi.<your-data-center>.com
   TUYA_AUTHORIZE_URL=<the authorization page URL from step 5>
   ENCRYPTION_KEY=<a random 32+ byte secret, e.g. `openssl rand -hex 32`>
   ```
8. Tell the executor "Tuya is live" -- the next pass runs the same connect -> state -> command
   -> revoke scenario for real (against a real Tuya account, ideally with the "Tuya Smart" or
   "Smart Life" app's built-in device simulator so no physical hardware is required to prove it),
   greps the real container logs (`scripts/check-device-no-plaintext-secrets.sh`), and reports
   numbers.

## What happens if this sits unapproved

Nothing breaks: `device.list`/`device.state`/`device.command` are already live in the MCP
catalog and resolve to a clean `503 service_unavailable` ("Tuya is not configured on this
server") until the four Tuya env vars above are set -- same convention every other
un-provisioned provider adapter in this repo already uses (`resolveAdapter`'s `cfgKey` pattern).
No agent-facing tool is published as "working" while unverified.
