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
| spider | Pay as you go | T-SITE-F0b; model metered |
| diffbot | Free | T-SITE-F0b; model free_tier |
| exa | Free | T-SITE-F0b; model free_tier |
| tavily | Free | T-SITE-F0b; model free_tier |
| serper | Starter pack | T-SITE-F0b; model flat |
| twitterapi | pay-as-you-go credits | T-SITE-F0b; model metered |
| zerobounce | Pay as You Go | T-SITE-F0b; model flat |
| email_verify | pay-as-you-go credit pool | T-SITE-F0b; model metered |
| whoisxml | pay-as-you-go credit pool | T-SITE-F0b; model metered |
| whoisjson | Basic (free) | T-SITE-F0b; model free_tier |
| convertapi | Developer / top-up | T-SITE-F0b; model metered |
| apiflash | Lite | T-SITE-F0b; model flat |
| ocrspace | Free | T-SITE-F0b; model free_tier |
| canopy | pay-as-you-go | T-SITE-F0b; model flat |
| theirstack | API $49/month | T-SITE-F0b; model metered |
| usrealestate | RapidAPI BASIC | T-SITE-F0b; model metered |
| audd | $5/month base plan | T-SITE-F0b; model flat |
| ipqs | Free | T-SITE-F0b; model free_tier |
| hunter | Starter | T-SITE-F0b; model flat |
| 17track | Free plan, paid unpriced | T-SITE-F0b; model metered |
| zyte | Pay as you go | T-SITE-F0b; model metered |
| abr | Free GUID registration | T-SITE-F1; model free_tier; keyed free service, no overage billing |
| adbkidb | Public API, no key | T-SITE-F1; model free; no-auth public API, no billing surface |
| adzuna | Free key | T-SITE-F1; model free_tier; commercial use may need a licence agreement |
| africa | Free | T-SITE-F1; model free_tier; no card attached, overage = refusal |
| airnow | Free EPA API key | T-SITE-F1; model free_tier; no card attached, overage = refusal |
| apisports | Free | T-SITE-F1; model free_tier; not verifiable first-hand |
| autodev | Starter / Free | T-SITE-F1; model metered; formula: first 1,000 calls/month free, then usage-based data fees per provider-limits.json limit_proof |
| aviasales | Free partner token | T-SITE-F1; model free_tier; not verifiable first-hand |
| avwx | Hobby (free) | T-SITE-F1; model free_tier; not verifiable first-hand |
| balldontlie | Free (Basic data, 1 sport) | T-SITE-F1; model free_tier; no card attached, overage = refusal |
| banxico | Free SIE token | T-SITE-F1; model free_tier; free token via the SIE site, no billing surface |
| bea | Free UserID key | T-SITE-F1; model free_tier; free email-signup key, no billing surface |
| bhl | Free API key | T-SITE-F1; model free_tier; not verifiable first-hand |
| bls-macro | API v2 registered key (free) | T-SITE-F1; model free_tier; free registration, no billing surface |
| calendarific | Free | T-SITE-F1; model free_tier; card requirement and overage behaviour not stated on the page |
| checkwx | Trial Plan (free) | T-SITE-F1; model free_tier; risk: a key still on the old 3,000/day tier reportedly started charging about $1/month from 2026-06-01 (second-hand) - operator to confirm the key is on Trial |
| coingecko | Demo (free) | T-SITE-F1; model free_tier; no card attached, overage = refusal |
| comtrade | Free key | T-SITE-F1; model free_tier; not verifiable first-hand |
| congress | Free api.data.gov key | T-SITE-F1; model free_tier; free key, no billing surface |
| copernicus-sentinel | Free account | T-SITE-F1; model free_tier; overage = throttling, never billing |
| cordis | Public API, no key | T-SITE-F2; model free |
| courtlistener | Free authenticated token | T-SITE-F2; model free_tier |
| currents | Developer (free) | T-SITE-F2; model free_tier |
| currentuvindex | Public API, no key | T-SITE-F2; model free |
| destatis | Public API, no key | T-SITE-F2; model free |
| device | IoT Core trial / paid plan | T-SITE-F2; model metered |
| dhl | Initial-development key (free) | T-SITE-F2; model free_tier |
| dpla | Free key | T-SITE-F2; model free_tier |
| ecdc-surveillance | Public open data, no key | T-SITE-F2; model free |
| echo | Public, no key | T-SITE-F2; model free_tier |
| eia | Free API key | T-SITE-F2; model free_tier |
| ensembl | Public API, no key | T-SITE-F2; model free |
| exchangerate | Free | T-SITE-F2; model free_tier |
| fatsecret | Basic (free) | T-SITE-F2; model free_tier |
| fbi | Free api.data.gov key | T-SITE-F2; model free_tier |
| fcc | Free api.data.gov key | T-SITE-F2; model free_tier |
| fda_openfda | No key / free key | T-SITE-F2; model free_tier |
| fec | Free api.data.gov key | T-SITE-F2; model free_tier |
| figi | Free key | T-SITE-F2; model free_tier |
| firms | Free MAP_KEY | T-SITE-F2; model free_tier |
| geo | Free | T-SITE-F2; model free_tier |
| geocodio | Free | T-SITE-F3; model free_tier; card needed only above 2,500/day |
| geonames | Free registered account | T-SITE-F3; model free_tier |
| gfw | Free API token | T-SITE-F3; model free_tier |
| github-api | Free account PAT | T-SITE-F3; model free_tier |
| gus-poland | Anonymous | T-SITE-F3; model free_tier |
| health | Free api.data.gov key | T-SITE-F3; model free_tier |
| ibanapi | Free | T-SITE-F3; model free_tier; not verifiable first-hand |
| inaturalist | Anonymous | T-SITE-F3; model free_tier |
| insee | Free public plan | T-SITE-F3; model free_tier |
| ipapi | Free | T-SITE-F3; model free_tier |
| iqair | Community (free) | T-SITE-F3; model free_tier |
| irctc | RapidAPI BASIC | T-SITE-F3; model metered; RapidAPI price unreadable |
| jobs | Free registered keys | T-SITE-F3; model free_tier |
| jooble | Free key | T-SITE-F3; model free_tier; no price published |
| langbly | Pay-as-you-go | T-SITE-F3; model metered; card required for the 500K included characters |
| launch-library-2 | Free anonymous | T-SITE-F3; model free_tier |
| listennotes | Free | T-SITE-F3; model free_tier |
