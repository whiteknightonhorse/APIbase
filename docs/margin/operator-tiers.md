# Assumed provider tiers (operator to confirm)

The operator does not know the key tiers of any paid provider (answer 2026-10-14 15:40). Each provider below was given
the cheapest tier that includes the endpoint, marked `tier assumed: <name>; operator to confirm` in
`upstream_cost_note`. Correct the tier here and in the note once the operator has looked at the vendor account.

| provider | assumed tier | note |
|---|---|---|
| telnyx | Pay-as-you-go | Trial credit is not on the pricing page |
| twilio | Pay-as-you-go | Carrier fees depend on the recipient carrier |
| namesilo | pre-funded balance, no API plan | No API fee published |
| stability | pay-as-you-go credits | Pricing page is JS-rendered; credit rates from third-party sources |
| hf_inference | Free account + purchased credits | Free users get no included credits |
| assemblyai | pay-as-you-go | Rate card does not label the plan |
| amadeus | Self-Service free quota then pay-per-call | Per-request prices could not be read |
| browserbase | Developer ($20/mo, 100 hours) | provider-limits.json still says "Hobby 100 sessions"; the page shows Free = 1 browser hour |
| api2pdf | pay-per-use | One plan |
| resend | Free | 3,000/month, 100/day |
