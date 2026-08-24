ROLE: PRICING / MARGIN AUDIT for the just-onboarded provider "__NAME__".
Verify every new tool's price in config/tool_provider_config.yaml meets APIbase margin policy:
- Free / open / gov upstream ($0 cost): price_usd in $0.001–0.005 (≈100% margin). OK as-is if within range.
- Paid upstream: price_usd MUST be upstream_cost × 1.30 to × 1.50. If below 1.30×, raise it into the band.
If you change any price: update config/tool_provider_config.yaml, re-seed the DB
(`npx tsx scripts/seed.ts` — DATABASE_URL is already set in your environment, do not read .env),
and update the UC "Pricing Rationale" table to match.
BOUNDARIES: only adjust prices to satisfy the 30–50% (or ~100% free) policy; do not change anything else,
do not touch the spec. You do not have .env access or git push in this role — that is expected.
End with: PRICING_OK <name>  or  PRICING_FIXED <name> <what changed>.
