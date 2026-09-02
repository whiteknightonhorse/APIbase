# OPERATOR ACTION — verify apibase.pro in Google Search Console

**Status:** checked live 2026-09-02 — no `google-site-verification` file/meta tag exists
anywhere in `static/` or `content-hub/`, and no `GOOGLE_SEARCH_CONSOLE_*` credential is
set in the live environment. apibase.pro is not registered as a Search Console property.

## Why this matters, and when

Two independent things need this:

1. **Sitemap submission.** `sitemap-guides.xml` is already submitted to Bing
   (`scripts/bing-verify.py`, confirmed live). Bing is not Google — Search Console is the
   only channel that tells us how Google specifically is crawling/indexing the guides
   corpus. Per Fable's ruling on T-30 dispute q-1 (Q1.4): this should be closed before
   printing starts (2026-09-04) if practical, but does not block the print pipeline
   itself (the date guard + operator mockup sign-off are the real gates — see
   `~/content-machine/RESUME.md`).
2. **Thin-corpus governor.** `~/content-machine/scripts/thin-corpus-governor.py` (Fable
   ruling Q1.5) needs real Search Console index-status and impressions data to compute its
   halt predicate once the guides corpus passes 30 published pages. Until this is set up,
   that script logs `governor_check_unavailable` every Monday and does not (cannot) halt
   printing on a real signal — genuinely unenforced, not silently passing.

Neither of these is urgent on 2026-09-02 (0 guides published, corpus threshold is 30
guides = roughly two weeks away at 2/day). But this is the same class of one-time human
action as the Smithery description field — cheaper to do once, early, than to remember
under time pressure later.

## The action needed (requires the operator's Google account)

1. Go to **https://search.google.com/search-console**, sign in with the Google account
   that should own this property.
2. Add property → URL prefix → `https://apibase.pro`.
3. Verify ownership. The simplest method for this stack: **HTML file upload** — Search
   Console gives you a file like `googleXXXXXXXXXXXXXXXX.html`; drop it at
   `static/googleXXXXXXXXXXXXXXXX.html` in the `apibase` repo (same pattern as
   `static/BingSiteAuth.xml`), commit via `ci-staging` → `promote_staging.sh`, then click
   Verify in Search Console. (Alternative: DNS TXT record on `apibase.pro`, if the
   operator prefers not to touch the repo for this.)
4. Once verified, submit the sitemap: Search Console → Sitemaps → add
   `https://apibase.pro/sitemap-guides.xml` (and `https://apibase.pro/sitemap.xml` if not
   already submitted there).
5. For the thin-corpus governor to eventually read real data (only needed before the
   corpus hits 30 guides): create a Search Console API credential (a service account with
   "Owner" access granted on the property, or an OAuth client) and set
   `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON` (path to the key file) or
   `GOOGLE_SEARCH_CONSOLE_CLIENT_ID` + `GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN` in
   `~/apibase/.env` (chmod 600, gitignored — same handling as every other credential in
   this repo, per the 2026-04-08 CLAUDE.md flywheel rule). Then implement
   `fetch_gsc_index_status()` in `thin-corpus-governor.py` against the URL Inspection API
   (index status) and Search Analytics API (impressions) — currently a documented stub
   that refuses to fabricate a result.

That's the entire fix: one property verification (steps 1-4, ~5 minutes), plus an
optional API credential (step 5) that only needs to exist before the guides corpus
reaches 30 published pages.
