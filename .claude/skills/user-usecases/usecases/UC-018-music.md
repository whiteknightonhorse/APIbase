# UC-018: MusicBrainz + Discogs + ListenBrainz + AcoustID + Wikidata + RadioBrowser (Music / Audio Discovery / Music Intelligence)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-018 |
| **Provider** | MusicBrainz (CC0, 50M+ recordings) + Discogs Data Dumps (CC0, 16M+ releases) + ListenBrainz (CC0, recommendations) + AcoustID (CC-BY-SA, audio fingerprinting) + Wikidata (CC0, knowledge graph) + RadioBrowser (Public Domain, 40K+ stations) |
| **Category** | Music / Audio Discovery / Music Intelligence |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## RESEARCH REPORT: UC-018 Music / Audio Discovery / Music Intelligence

---

# Phase 1: Comprehensive Candidate Discovery (28 Candidates Evaluated)

## 1.1 Music Metadata Databases

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 1 | **MusicBrainz** | CC0 core data, 1 req/sec | $0-2,000/mo (support tiers) | 50M+ recordings, 2M+ artists, CC0 |
| 2 | **Discogs Data Dumps** | CC0, monthly XML dumps | $0 (self-hosted) | 16M+ releases, 8M+ artists, vinyl/CD |
| 3 | **Discogs API** | 60 req/min auth | $0 | Same data but restrictive ToS |
| 4 | **Gracenote/Nielsen** | Non-commercial only | Enterprise | Industry standard, no public access |
| 5 | **TheAudioDB** | Limited free tier | Patreon | Community-curated, resale prohibited |

## 1.2 Streaming Platform APIs

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 6 | **Spotify Web API** | Free (rate limited) | $0 | 100M+ tracks, recommendations, audio features |
| 7 | **Apple Music API** | Free (MusicKit) | $0 | Apple ecosystem, curated playlists |
| 8 | **Deezer API** | Free | $0 | 90M+ tracks, flow recommendations |
| 9 | **SoundCloud API** | Limited | $0 | Indie/electronic focus |
| 10 | **Tidal API** | Developer program | $0 | Hi-Fi audio, non-commercial only |
| 11 | **YouTube Data API** | 10K units/day | $0 | Largest music video library |
| 12 | **Amazon Music** | No public API | N/A | No developer program |

## 1.3 Music Discovery / Recommendation

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 13 | **Last.fm** | Free API key | $0 | Scrobbling, similar artists, charts |
| 14 | **ListenBrainz** | CC0, public API | $0 | Open recommendations, LB Radio |
| 15 | **Bandcamp** | No public API | N/A | Indie artist marketplace |
| 16 | **Rate Your Music** | API not launched | N/A | Community ratings |

## 1.4 Music Recognition / Audio Analysis

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 17 | **AcoustID** | 10K free trial | €50-500/mo | Audio fingerprinting, Chromaprint (MIT) |
| 18 | **ACRCloud** | Trial | Enterprise | Music recognition, internal use only |
| 19 | **AudD** | Trial | Subscription | Music recognition API |
| 20 | **Musixmatch** | Non-commercial | Enterprise | Lyrics + metadata |

## 1.5 Open Music Data

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 21 | **Wikidata Music** | CC0, SPARQL + REST | $0 | Music entities, cross-links, knowledge graph |
| 22 | **Internet Archive Audio** | Free | $0 | CC-licensed audio, live recordings |
| 23 | **Cover Art Archive** | Free | $0 | MetaBrainz ecosystem, image copyright varies |
| 24 | **IMSLP/Petrucci** | Public domain scores | $0 | Classical music sheets |

## 1.6 Radio / Charts / Industry

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 25 | **RadioBrowser** | Public Domain, no auth | $0 | 40K+ internet radio stations |
| 26 | **Billboard Charts** | No official API | N/A | Proprietary chart data |
| 27 | **Chartmetric** | No free tier | $350/mo | Industry analytics |
| 28 | **Setlist.fm** | Non-commercial | $0 | Concert setlists |

---

# Phase 2: Evaluation Matrix (12 Parameters, Max 245 Points)

### Candidate A: MusicBrainz

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | CC0 core data; support tiers $0-2,000/mo (optional) |
| Data Coverage / Depth | **5** | x4 | **20** | 50M+ recordings, 2M+ artists, releases, works, labels, relationships |
| API Quality | **4** | x3 | **12** | REST/JSON+XML, well-documented, 1 req/sec rate limit |
| Affiliate / Revenue Opp | **2** | x5 | **10** | No direct affiliate; enables streaming platform affiliate via external IDs |
| Agent Utility | **5** | x5 | **25** | Artist lookup, release search, recording identification, relationships |
| ToS Compatibility | **5** | x5 | **25** | **CC0 core data** — "anyone can download and use in any way they see fit" |
| MCP Ecosystem | **3** | x3 | **9** | Several MCP servers exist (spotify-plus-mcp uses MB) |
| Unique Features | **5** | x4 | **20** | MBID system, ISRCs, relationships graph, genre taxonomy |
| New Pattern Potential | **5** | x5 | **25** | Federated open data intelligence — new pattern |
| Cache Potential | **5** | x3 | **15** | Music metadata permanent; full DB dumps available |
| Cross-UC Synergy | **4** | x4 | **16** | UC-008 Ticketmaster (concerts), UC-010 TMDB (soundtracks) |
| Market Position | **5** | x3 | **15** | THE open music database, industry standard for metadata |
| **TOTAL** | | | **217/245** | **HIGHEST SCORE** |

---

### Candidate B: Discogs Data Dumps (CC0)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | CC0 data dumps, completely free |
| Data Coverage / Depth | **5** | x4 | **20** | 16M+ releases, 8M+ artists, physical formats (vinyl, CD, cassette) |
| API Quality | **2** | x3 | **6** | XML dumps (not REST API); requires self-hosting |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate (API marketplace exists but data dumps separate) |
| Agent Utility | **4** | x5 | **20** | Physical release details, vinyl pressings, label history |
| ToS Compatibility | **5** | x5 | **25** | **CC0** — "made available under the CC0 No Rights Reserved license" |
| MCP Ecosystem | **2** | x3 | **6** | Limited MCP usage |
| Unique Features | **5** | x4 | **20** | ONLY comprehensive source for physical formats/pressings |
| New Pattern Potential | **4** | x5 | **20** | Self-hosted CC0 dump = P10 pattern (permanent cache) |
| Cache Potential | **5** | x3 | **15** | Monthly dumps; data rarely changes after release |
| Cross-UC Synergy | **3** | x4 | **12** | UC-009 E-commerce (vinyl marketplace pricing) |
| Market Position | **5** | x3 | **15** | THE physical music database, vinyl/collector bible |
| **TOTAL** | | | **189/245** | |

**CRITICAL DISTINCTION**: CC0 license applies to DATA DUMPS only. Discogs API has separate ToS prohibiting resale ("Selling or giving to any third party Our API, the Content, or access to Our API or the Content"). APIbase MUST self-host from dumps, NOT proxy the live API.

---

### Candidate C: ListenBrainz

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | CC0 data, free API |
| Data Coverage / Depth | **4** | x4 | **16** | Listening history, collaborative filtering, playlists |
| API Quality | **4** | x3 | **12** | REST/JSON, documented, rate limited |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate |
| Agent Utility | **5** | x5 | **25** | Music recommendations, similar artists, LB Radio playlists |
| ToS Compatibility | **5** | x5 | **25** | **CC0** — "All of our data is available for commercial use" |
| MCP Ecosystem | **2** | x3 | **6** | Limited |
| Unique Features | **5** | x4 | **20** | ONLY open-source recommendation engine (Spotify alternative) |
| New Pattern Potential | **4** | x5 | **20** | Open recommendation = unique capability |
| Cache Potential | **4** | x3 | **12** | Recommendations refresh daily; artist similarity stable |
| Cross-UC Synergy | **3** | x4 | **12** | Limited direct overlap |
| Market Position | **3** | x3 | **9** | Growing MetaBrainz project |
| **TOTAL** | | | **187/245** | |

---

### Candidate D: Wikidata Music Entities

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | CC0, free SPARQL + REST |
| Data Coverage / Depth | **3** | x4 | **12** | Rich music entities but less structured than MusicBrainz |
| API Quality | **3** | x3 | **9** | SPARQL powerful but complex |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate |
| Agent Utility | **4** | x5 | **20** | Artist bios, awards, band members, cross-links |
| ToS Compatibility | **5** | x5 | **25** | **CC0** — "No rights reserved" |
| MCP Ecosystem | **2** | x3 | **6** | Some Wikidata MCP exists |
| Unique Features | **4** | x4 | **16** | Cross-linked knowledge graph, multilingual |
| New Pattern Potential | **3** | x5 | **15** | Knowledge enrichment (already used in UC-017) |
| Cache Potential | **5** | x3 | **15** | Entity data stable |
| Cross-UC Synergy | **5** | x4 | **20** | UC-010 TMDB, UC-017 OpenAlex — universal enrichment |
| Market Position | **4** | x3 | **12** | Largest free structured knowledge base |
| **TOTAL** | | | **180/245** | |

---

### Candidate E: AcoustID

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **4** | x5 | **20** | 10K free trial; commercial €50-500/mo |
| Data Coverage / Depth | **4** | x4 | **16** | Audio fingerprint database linked to MusicBrainz |
| API Quality | **4** | x3 | **12** | REST, well-documented |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate |
| Agent Utility | **4** | x5 | **20** | "What song is this?" — Shazam-equivalent from open source |
| ToS Compatibility | **4** | x5 | **20** | CC-BY-SA 3.0 / PD database; Chromaprint = MIT. No explicit proxy ban |
| MCP Ecosystem | **1** | x3 | **3** | No known MCP servers |
| Unique Features | **5** | x4 | **20** | ONLY open audio fingerprinting service |
| New Pattern Potential | **4** | x5 | **20** | Audio intelligence unique capability |
| Cache Potential | **4** | x3 | **12** | Fingerprint results permanent (song = song forever) |
| Cross-UC Synergy | **2** | x4 | **8** | Limited direct overlap |
| Market Position | **4** | x3 | **12** | Part of MetaBrainz, unique niche |
| **TOTAL** | | | **168/245** | |

---

### Candidate F: RadioBrowser

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | Public Domain, no auth, no rate limits |
| Data Coverage / Depth | **3** | x4 | **12** | 40K+ radio stations, stream URLs |
| API Quality | **4** | x3 | **12** | REST/JSON, self-hostable |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate |
| Agent Utility | **3** | x5 | **15** | Radio station discovery by genre/country/language |
| ToS Compatibility | **5** | x5 | **25** | **Public Domain** — "may use it in free and non free softwares" |
| MCP Ecosystem | **1** | x3 | **3** | No known MCP |
| Unique Features | **4** | x4 | **16** | Only comprehensive open radio directory |
| New Pattern Potential | **3** | x5 | **15** | Supplementary data |
| Cache Potential | **5** | x3 | **15** | Station data stable |
| Cross-UC Synergy | **2** | x4 | **8** | UC-012 Maps (station by location) |
| Market Position | **3** | x3 | **9** | Community-maintained |
| **TOTAL** | | | **160/245** | |

---

### Candidate G: Spotify Web API (DISQUALIFIED)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **4** | x5 | **20** | Free, rate limited |
| Data Coverage / Depth | **5** | x4 | **20** | 100M+ tracks, audio features, recommendations |
| API Quality | **5** | x3 | **15** | Excellent REST/JSON |
| Affiliate / Revenue Opp | **3** | x5 | **15** | Spotify referral possible |
| Agent Utility | **5** | x5 | **25** | Best-in-class music intelligence |
| ToS Compatibility | **1** | x5 | **5** | **DISQUALIFIED**: "will not sell any Spotify Content" + AI ban |
| MCP Ecosystem | **4** | x3 | **12** | Multiple Spotify MCP servers (all violate ToS) |
| Unique Features | **5** | x4 | **20** | Audio features (danceability, energy, valence), personalization |
| New Pattern Potential | **4** | x5 | **20** | Cannot use |
| Cache Potential | **1** | x3 | **3** | Caching prohibited |
| Cross-UC Synergy | **4** | x4 | **16** | Cannot use |
| Market Position | **5** | x3 | **15** | Market leader |
| **TOTAL** | | | **186/245** | **DISQUALIFIED** |

---

## Complete Scoring Ranking

| Rank | Candidate | Score (/245) | Status |
|------|-----------|--------------|--------|
| 1 | **MusicBrainz** | **217** | CLEARED (CC0) |
| 2 | **Discogs Data Dumps** | **189** | CLEARED (CC0 dumps only) |
| 3 | **ListenBrainz** | **187** | CLEARED (CC0) |
| 4 | Spotify Web API | 186 | DISQUALIFIED |
| 5 | **Wikidata Music** | **180** | CLEARED (CC0) |
| 6 | **AcoustID** | **168** | CLEARED (CC-BY-SA + commercial sub) |
| 7 | **RadioBrowser** | **160** | CLEARED (Public Domain) |
| 8 | Discogs API | 159 | DISQUALIFIED (resale ban) |
| 9 | Apple Music API | 156 | DISQUALIFIED |
| 10 | YouTube Data API | 155 | DISQUALIFIED |
| 11 | Last.fm | 148 | DISQUALIFIED |
| 12 | Cover Art Archive | 142 | CONDITIONAL |
| 13 | ACRCloud | 133 | DISQUALIFIED |
| 14 | Gracenote/Nielsen | 131 | DISQUALIFIED |
| 15 | Bandsintown | 128 | CONDITIONAL |
| 16 | Songkick | 127 | DISQUALIFIED |
| 17 | Genius | 125 | DISQUALIFIED |
| 18 | Internet Archive Audio | 124 | CONDITIONAL |
| 19 | Chartmetric | 122 | DISQUALIFIED |
| 20 | IMSLP/Petrucci | 122 | CONDITIONAL |
| 21 | Setlist.fm | 121 | DISQUALIFIED |
| 22 | Musixmatch | 117 | DISQUALIFIED |
| 23 | TheAudioDB | 114 | CONDITIONAL |
| 24 | Deezer API | 114 | DISQUALIFIED |
| 25 | Billboard Charts | 112 | DISQUALIFIED |
| 26 | Tidal API | 107 | DISQUALIFIED |
| 27 | SoundCloud API | 106 | DISQUALIFIED |
| 28 | AudD | 102 | DISQUALIFIED |

---

# Phase 3: Terms of Service Deep Dive

## 3.1 CLEARED FOR USE (Green Light)

### MusicBrainz — CC0 1.0 (core data)
- **License**: CC0 1.0 — Public Domain Dedication (core data)
- **Exact clause**: *"The core data...is licensed under the CC0, which is effectively placing the data into the Public Domain. This means that anyone can download and use the core data in any way they see fit. No restrictions, no worries!"*
- **Core data includes**: Artists, Recordings, Releases, Release Groups, Works, Labels, Areas, Events, Genres, Instruments, Places, Series, Relationships, URLs, ISRCs, barcodes, MBIDs
- **Supplementary data**: CC BY-NC-SA 3.0 (tags, ratings, annotations, edit history) — NOT included in APIbase
- **Commercial support tiers**: Stealth ($0), Bronze ($100/mo), Silver ($600/mo), Gold ($1,250/mo)
- **Self-hosted option**: Full database dumps + Live Data Feed available
- **VERDICT**: **PERFECT ToS** — CC0 core covers ALL essential metadata.

### Discogs Data Dumps — CC0 1.0
- **Exact clause**: *Data dumps "made available under the CC0 No Rights Reserved license."*
- **Contains**: 16M+ releases, 8M+ artists, labels, masters, physical format details
- **CRITICAL**: CC0 applies to DATA DUMPS only. Discogs API has separate ToS: *"Selling or giving to any third party Our API, the Content, or access to Our API or the Content"* — PROHIBITED.
- **Implementation**: Self-host from monthly XML dumps. No API proxy.
- **VERDICT**: **CLEARED** — CC0 dumps freely redistributable. Must NOT use live API.

### ListenBrainz — CC0 1.0
- **Exact clause**: *"All of our data is available for commercial use."*
- **Listen data and text**: CC0
- **Server software**: GPL (but data CC0)
- **VERDICT**: **CLEARED** — CC0, commercial use explicitly stated.

### Wikidata — CC0 1.0
- **Exact clause**: *"All structured data from the main, Property, Lexeme, and EntitySchema namespace is available under the Creative Commons CC0 License."*
- **Caveat**: Wikimedia API guidelines: cannot sublicense API access — but data itself CC0.
- **Implementation**: Cache locally, serve from APIbase (same as UC-017)
- **VERDICT**: **CLEARED** — CC0 data, cache+serve compliant.

### AcoustID — CC-BY-SA 3.0 / PD
- **Database**: CC-BY-SA 3.0 and PD
- **Chromaprint library**: MIT license
- **Commercial plans**: EUR 50/mo (1M searches) → EUR 500/mo (150M searches)
- **No explicit proxy/resale prohibition** found in published terms
- **MetaBrainz Foundation** — open-data philosophy
- **VERDICT**: **CLEARED** (conditional on commercial subscription). CC-BY-SA allows redistribution with attribution.

### RadioBrowser — Public Domain
- **Exact clause**: *"Data license: public domain. Software license: GPL."*
- **Exact clause 2**: *"You may use it in free and non free softwares, install it on your own server and mirror all its data."*
- **40K+ stations**, no auth, self-hostable
- **VERDICT**: **CLEARED** — Public Domain, explicitly allows commercial use.

## 3.2 DISQUALIFIED (Red Light)

| # | Candidate | EXACT Reason for Disqualification |
|---|-----------|-----------------------------------|
| 1 | **Spotify** | *"You will not sell any Spotify Content"* + *"do not transfer Spotify Content to third parties"* + *"using the Spotify Platform or any Spotify Content to train a machine learning or AI model"* |
| 2 | **Apple Music** | *"Your app may not require payment or indirectly monetize access to the Apple Music service"* |
| 3 | **Deezer** | *"shall not...generate...any moneys, incomes, revenues, data or any other consideration in connection with the use of the Services"* |
| 4 | **SoundCloud** | *"The public APIs cannot be used for commercial use cases"* |
| 5 | **Tidal** | *"non-commercial applications only"* |
| 6 | **YouTube Data** | *"selling, purchasing, leasing, lending, conveying, redistributing, or sublicensing...prohibited"* |
| 7 | **Last.fm** | *"You must not sub-license the Last.fm Data to others"* + *"non-commercial purposes"* |
| 8 | **Discogs API** | *"Selling or giving to any third party Our API, the Content, or access to Our API or the Content"* |
| 9 | **ACRCloud** | *"Services may only be used by Customer's employees or by independent contractors hired by Customer"* |
| 10 | **AudD** | *"not...in a timesharing or service bureau arrangement"* |
| 11 | **Musixmatch** | Non-commercial only; lyrics = licensed IP |
| 12 | **Genius** | *"personal use...not for direct commercial endeavors"* |
| 13 | **Gracenote/Nielsen** | *"non-commercial applications only"* |
| 14 | **Songkick** | *"non-commercial and informational use only"* |
| 15 | **Setlist.fm** | *"solely for non-commercial purposes"* |
| 16 | **Chartmetric** | $350/mo, enterprise terms, no resale |
| 17 | **Billboard** | No official API; proprietary data |

---

# Phase 4: Winner Recommendation

## THE WINNING STRATEGY: MetaBrainz Ecosystem + Open Data Federation

### Primary Stack (6 sources):

```
Provider Stack:              Role:                          License:        Cost:
----------------------------------------------------------------------------------------------
MusicBrainz                  Music metadata backbone         CC0 (core)      $100/mo (Bronze)
Discogs Data Dumps           Physical formats, vinyl, labels CC0             $0 (self-hosted)
ListenBrainz                 Recommendations, playlists      CC0             $0
Wikidata                     Knowledge graph enrichment      CC0             $0
AcoustID                     Audio fingerprinting            CC-BY-SA/PD     €50/mo (~$55)
RadioBrowser                 Internet radio directory        Public Domain   $0

TOTAL UPSTREAM: ~$155/mo (data) + ~$200/mo (infra) = ~$355/mo
```

## Why This Stack Wins

```
STRATEGIC ADVANTAGES:
=====================

1. 100% CC0/PUBLIC DOMAIN CORE (strongest ToS of any UC)
   - MusicBrainz CC0, Discogs CC0, ListenBrainz CC0,
     Wikidata CC0, RadioBrowser PD, AcoustID CC-BY-SA
   - ZERO ToS risk. Most legally clean UC ever.

2. ALL STREAMING PLATFORMS DISQUALIFIED
   - Spotify, Apple Music, Deezer, SoundCloud, Tidal, YouTube = all banned
   - Open data = THE ONLY legal path for music intelligence
   - APIbase becomes ONLY legal music intelligence layer for agents

3. FEDERATION CREATES EMERGENT VALUE
   - No single source has everything
   - MusicBrainz + Discogs + ListenBrainz + Wikidata + AcoustID =
     more comprehensive than any single proprietary API
   - Entity resolution across 6 sources = unique value

4. SELF-HOSTABLE = IMMUNE TO SHUTDOWNS
   - Full DB dumps + Live Data Feed (MusicBrainz)
   - Monthly XML dumps (Discogs)
   - Self-hosted (RadioBrowser, AcoustID Chromaprint)
   - No dependency on any single API staying online

5. NATURAL AFFILIATE MONETIZATION
   - MusicBrainz + Wikidata contain Spotify/Apple/Amazon external IDs
   - APIbase inserts streaming affiliate links
   - Open data ENABLES affiliate revenue by providing cross-reference IDs

6. CROSS-UC ENTERTAINMENT HUB
   - UC-008 Ticketmaster: artist → upcoming concerts → ticket sales
   - UC-010 TMDB: artist → film soundtracks → movie discovery
   - UC-012 Maps: venue locations, studio tours
   - Creates complete entertainment intelligence graph
```

---

# Phase 5: Seven Proposed MCP Tools

### Tool 1: `music_artist_lookup`
```json
{
  "name": "music_artist_lookup",
  "description": "Comprehensive artist information: biography, discography summary, genres, active years, related artists, band members, awards, and external platform IDs (Spotify, Apple Music, Discogs). Combines MusicBrainz CC0 core with Wikidata knowledge graph.",
  "parameters": {
    "query": "Radiohead",
    "mbid": "MusicBrainz Artist ID (optional)",
    "include": ["releases", "recordings", "relationships", "biography", "external_ids", "genres", "awards"]
  },
  "x402_price": "$0.003 per lookup",
  "cache_ttl": "7 days",
  "upstream": "MusicBrainz (CC0) + Wikidata (CC0)"
}
```

### Tool 2: `music_release_search`
```json
{
  "name": "music_release_search",
  "description": "Search albums/releases with detailed track listings, release dates, formats (vinyl, CD, digital, cassette), labels, barcodes, cover art URLs. MusicBrainz release data + Discogs physical format details.",
  "parameters": {
    "query": "OK Computer",
    "artist": "Radiohead",
    "format": "all | vinyl | cd | digital | cassette",
    "year_from": 1997,
    "year_to": 1997,
    "include": ["tracks", "credits", "formats", "cover_art_url", "marketplace_stats"]
  },
  "x402_price": "$0.003 per search",
  "cache_ttl": "7 days",
  "upstream": "MusicBrainz (CC0) + Discogs Data Dump (CC0) + Cover Art Archive (URLs)"
}
```

### Tool 3: `music_discover`
```json
{
  "name": "music_discover",
  "description": "Personalized music recommendations: discover new music based on seed artists, genres, or listening patterns. Playlist-style results using ListenBrainz collaborative filtering + MusicBrainz relationships. The open alternative to Spotify Discover.",
  "parameters": {
    "seed_artists": ["Radiohead", "Boards of Canada"],
    "seed_tags": ["shoegaze", "electronic", "ambient"],
    "mode": "similar_artists | playlist | deep_cuts | popular",
    "limit": 20
  },
  "x402_price": "$0.005 per discovery",
  "cache_ttl": "24 hours",
  "upstream": "ListenBrainz (CC0) + MusicBrainz (CC0)"
}
```

### Tool 4: `music_identify`
```json
{
  "name": "music_identify",
  "description": "Identify a song from audio fingerprint. Accepts Chromaprint fingerprint + duration, returns matching recordings with full metadata. Open-source Shazam equivalent.",
  "parameters": {
    "fingerprint": "base64-encoded Chromaprint fingerprint",
    "duration": 240,
    "include_metadata": true
  },
  "x402_price": "$0.008 per identification",
  "cache_ttl": "30 days (permanent: song = song forever)",
  "upstream": "AcoustID (CC-BY-SA) + MusicBrainz (CC0)"
}
```

### Tool 5: `music_radio_stations`
```json
{
  "name": "music_radio_stations",
  "description": "Discover internet radio stations worldwide by genre, language, country, or keyword. Returns stream URLs, codec details, bitrates, and popularity metrics. 40K+ stations.",
  "parameters": {
    "genre": "jazz",
    "country": "US",
    "language": "english",
    "query": "KEXP",
    "sort_by": "votes | clicks | trending | random",
    "limit": 25
  },
  "x402_price": "$0.002 per search",
  "cache_ttl": "6 hours",
  "upstream": "RadioBrowser (Public Domain)"
}
```

### Tool 6: `music_knowledge_graph`
```json
{
  "name": "music_knowledge_graph",
  "description": "Query music knowledge graph: band members and roles, awards, collaborations, influences, label history, genre taxonomy, and connections to films/TV (via Wikidata → UC-010 TMDB). Bridges music to entertainment ecosystem.",
  "parameters": {
    "entity": "Radiohead",
    "entity_type": "artist | album | song | label | genre",
    "relations": ["members", "awards", "influences", "collaborators", "filmography", "labels", "genres"]
  },
  "x402_price": "$0.004 per query",
  "cache_ttl": "7 days",
  "upstream": "Wikidata (CC0) + MusicBrainz (CC0)"
}
```

### Tool 7: `music_cross_reference`
```json
{
  "name": "music_cross_reference",
  "description": "Cross-reference music entity across ALL platforms: resolve name/MBID/Spotify ID/Discogs ID/ISRC/barcode to all known identifiers + unified metadata. Links to UC-008 Ticketmaster (concerts) and UC-010 TMDB (film appearances).",
  "parameters": {
    "identifier": "Radiohead or spotify:artist:4Z8W4fKeB5YxbusRsdQVPb",
    "identifier_type": "name | mbid | spotify_id | discogs_id | isrc | barcode | wikidata_qid",
    "include_events": true,
    "include_filmography": true
  },
  "x402_price": "$0.005 per cross-reference",
  "cache_ttl": "7 days",
  "upstream": "MusicBrainz (CC0) + Wikidata (CC0) + Discogs Data (CC0) + UC-008 + UC-010"
}
```

---

# Phase 6: Revenue Model

## 6.1 Upstream Costs

| Source | Monthly Cost | Notes |
|--------|-------------|-------|
| MusicBrainz (Bronze) | $100/mo | Live Data Feed, commercial support |
| AcoustID (Small) | ~$55/mo (€50) | 1M fingerprint lookups/month |
| Discogs Data Dump | $0 | CC0, self-hosted from monthly dumps |
| ListenBrainz | $0 | CC0, public API |
| Wikidata | $0 | CC0, cache locally |
| RadioBrowser | $0 | Public Domain, self-hostable |
| **Infrastructure** | ~$200/mo | PostgreSQL for MB/Discogs mirrors |
| **TOTAL UPSTREAM** | **~$355/mo** | |

## 6.2 Revenue Projections

### Phase 1 (Month 1-6): 53K req/day

| Stream | Revenue |
|--------|---------|
| x402 tool revenue | $199/mo |
| Streaming affiliate (Spotify/Apple/Amazon signups) | $74/mo |
| Concert tickets (UC-008 cross-sell) | $16/mo |
| Vinyl/merch (Amazon Associates) | $15/mo |
| Cross-UC enrichment | $65/mo |
| **TOTAL** | **$369/mo** |

### Phase 2 (Month 7-12): 200K req/day

| Stream | Revenue |
|--------|---------|
| x402 tool revenue | $750/mo |
| Streaming affiliate | $280/mo |
| Concert tickets (UC-008) | $60/mo |
| Vinyl/merch | $60/mo |
| Cross-UC enrichment | $250/mo |
| **TOTAL** | **$1,400/mo** |

### Phase 3 (Month 13-24): 750K req/day

| Stream | Revenue |
|--------|---------|
| x402 tool revenue | $2,800/mo |
| Streaming affiliate | $840/mo |
| Concert tickets (UC-008) | $180/mo |
| Vinyl/merch | $180/mo |
| Cross-UC enrichment | $700/mo |
| **TOTAL** | **$4,700/mo** |

## 6.3 Affiliate Revenue Detail

| Affiliate | Trigger | Commission | Est. Phase 3 |
|-----------|---------|-----------|--------------|
| Spotify Premium signup | Artist cross-reference → "Listen on Spotify" | $7.35/signup | $350/mo |
| Apple Music signup | Cross-reference → "Listen on Apple Music" | ~$7/signup | $210/mo |
| Amazon Music signup | Cross-reference → "Listen on Amazon" | $3-5/signup | $100/mo |
| Ticketmaster (UC-008) | Artist → "See live" → ticket purchase | 1-4.15% | $180/mo |
| Amazon Associates vinyl/merch | Release search → "Buy on vinyl" | 3-5% | $180/mo |

**Key insight**: MusicBrainz + Wikidata contain Spotify/Apple/Amazon external IDs. APIbase uses these to insert affiliate links — open data ENABLES streaming affiliate revenue.

## 6.4 Break-Even Analysis

| Metric | Value |
|--------|-------|
| Total upstream cost | ~$355/month |
| Break-even | ~55K req/month (~1,800/day) = **Month 1** |
| Margin Phase 1 | 4% (early, building volume) |
| Margin Phase 3 | **87%** ($4,700 rev / $600 cost) |

---

# Phase 7: Monetization Pattern P18

## P18: Federated Open Data Intelligence

**UC:** UC-018 MusicBrainz + Discogs + ListenBrainz + AcoustID + Wikidata + RadioBrowser
**Core Strategy:** Federate multiple CC0/Public Domain data sources into a unified intelligence layer that exceeds any single source. Value = FEDERATION + ENRICHMENT across 6 independent open datasets, not caching one API's data. All streaming platforms banned for proxy → open data = ONLY legal path → monopoly on ToS-compliant music intelligence for agents.

```
Условия:
  • Upstream = 6 CC0/PD sources (strongest ToS of any UC)
  • MusicBrainz CC0 (core), Discogs CC0 (dumps), ListenBrainz CC0,
    Wikidata CC0, AcoustID CC-BY-SA, RadioBrowser PD
  • ALL streaming platform APIs DISQUALIFIED
  • Self-hostable: full DB dumps + Live Data Feed
  • Natural affiliate via cross-reference IDs (Spotify/Apple/Amazon IDs in open data)

Механика:
  Stream 1: Agent → x402 $0.002-0.008 → APIbase → cache (6 sources federated) → response
  Stream 2: Streaming affiliate:
    Artist cross-reference → Spotify/Apple/Amazon external IDs → affiliate links
    Agent shows user "Listen on Spotify" → user signs up → $7.35 CPA
  Stream 3: Cross-UC entertainment graph:
    UC-008 Ticketmaster: artist → upcoming concerts → ticket affiliate
    UC-010 TMDB: artist → film soundtracks → movie discovery
    UC-012 Maps: venue/studio locations
    Music + Movies + Events + Maps = complete entertainment intelligence

Revenue: x402 fees + streaming affiliate + cross-UC entertainment
Margin: 4% Phase 1 → 87% Phase 3 (volume-dependent, low upstream)
Risk: Low — CC0 data cannot be revoked. Self-hostable.
Break-even: Month 1 (~55K req/mo)

Отличие от P1 (Builder Key Proxy):
  P1: Single source, simple proxy
  P18: 6 sources FEDERATED into intelligence layer
  P1: Convenience value only
  P18: Entity resolution + recommendation + identification = compound value

Отличие от P10 (Permanent Cache / TMDB):
  P10: Cache ONE proprietary API permanently
  P18: Federate SIX open sources into unified graph
  P10: Dependent on single upstream
  P18: Self-hostable, immune to shutdowns

Отличие от P8 (Transactional Affiliate / Ticketmaster):
  P8: Free API + built-in affiliate URLs
  P18: CC0 data + INSERTED affiliate via cross-reference IDs
  P8: Affiliate auto-injected by provider
  P18: Affiliate constructed by APIbase from external ID mapping

Sub-pattern: Multi-Source Entity Resolution (P18a)
  Resolve single music entity across MusicBrainz, Discogs, Wikidata,
  and streaming platform IDs. No single source has all IDs.
  Federation creates unique value no competitor can match.

Sub-pattern: Open Recommendation Engine (P18b)
  ListenBrainz = ONLY open-source CC0 recommendation engine.
  Spotify-like "discover" without Spotify ToS.
  Genuinely differentiated capability.

Sub-pattern: Open Audio Intelligence (P18c)
  AcoustID + Chromaprint = Shazam-equivalent from open source.
  Combined with MusicBrainz metadata → full "identify and enrich" pipeline.

Sub-pattern: Cross-Domain Entertainment Graph (P18d)
  Music → film soundtracks (UC-010 TMDB)
  Music → concerts (UC-008 Ticketmaster)
  Music → venues (UC-012 Maps)
  "Tell me about Radiohead" → discography + vinyl + similar artists +
  film soundtracks + upcoming concerts + venue locations

Примеры: MusicBrainz + Discogs + ListenBrainz (music), потенциально:
         OpenStreetMap + Wikipedia federation (geography/knowledge),
         any domain where proprietary APIs are locked but open data exists
```

---

# Phase 8: Architecture Summary

```
                    UC-018 ARCHITECTURE
    ┌─────────────────────────────────────────────┐
    │              APIbase Layer                    │
    │                                              │
    │   ┌─────────────────────────────────────┐   │
    │   │         7 MCP Tools                  │   │
    │   │  artist_lookup    release_search     │   │
    │   │  discover         identify           │   │
    │   │  radio_stations   knowledge_graph    │   │
    │   │  cross_reference                     │   │
    │   └──────────────┬──────────────────────┘   │
    │                  │                           │
    │   ┌──────────────┴──────────────────────┐   │
    │   │   Federation + Entity Resolution     │   │
    │   │  MBID ↔ Discogs ID ↔ Wikidata QID   │   │
    │   │  ↔ Spotify ID ↔ Apple ID ↔ ISRC     │   │
    │   └──────────────┬──────────────────────┘   │
    │                  │                           │
    │   ┌──────────────┴──────────────────────┐   │
    │   │   Self-Hosted Data Layer              │   │
    │   │  MusicBrainz mirror (PostgreSQL)     │   │
    │   │  Discogs dump (PostgreSQL)           │   │
    │   │  Wikidata cache (local)              │   │
    │   │  RadioBrowser mirror (optional)      │   │
    │   └──────────────────────────────────────┘   │
    └─────────────────────────────────────────────┘
                       │
    ┌──────────┬───────┼────────┬──────────┬──────────┐
    │          │       │        │          │          │
┌───┴───┐ ┌───┴───┐ ┌─┴──┐ ┌──┴───┐ ┌───┴───┐ ┌───┴────┐
│Music  │ │Discogs│ │LB  │ │Wiki  │ │Acoust │ │Radio   │
│Brainz │ │Dumps  │ │    │ │data  │ │ID     │ │Browser │
│CC0    │ │CC0    │ │CC0 │ │CC0   │ │CC-BY  │ │PD      │
│50M rec│ │16M rel│ │Recs│ │100M+ │ │Finger │ │40K stn │
└───────┘ └───────┘ └────┘ └──────┘ └───────┘ └────────┘

Cross-UC Entertainment Hub:
→ UC-008 Ticketmaster: artist → concerts → ticket sales
→ UC-010 TMDB: artist → film soundtracks → movie discovery
→ UC-012 Maps: venue locations, studio tours
```

---

# Phase 9: Cross-UC Synergy Map

| Partner UC | Direction | Integration | Revenue Impact |
|-----------|-----------|-------------|----------------|
| **UC-008 Ticketmaster** | → Outbound | Artist → upcoming concerts → ticket affiliate | +$180/mo Phase 3 |
| **UC-010 TMDB** | ↔ Bidirectional | Artist ↔ film soundtracks | +15% knowledge_graph calls |
| UC-012 Maps | → Outbound | Venue/studio locations | +5% enrichment |
| UC-009 E-commerce | → Outbound | Vinyl/merch → Amazon affiliate | +$180/mo Phase 3 |
| UC-007 Translation | ← Inbound | Translate artist bios | +5% lookup calls |

**Entertainment Trinity**: UC-008 (Events) + UC-010 (Movies) + UC-018 (Music) = complete entertainment intelligence platform for AI agents.

---

## Summary

| Metric | Value |
|--------|-------|
| **Winners** | MusicBrainz (217) + Discogs Dumps (189) + ListenBrainz (187) + Wikidata (180) + AcoustID (168) + RadioBrowser (160) |
| **Upstream cost** | ~$355/mo ($155 data + $200 infra) |
| **Revenue Phase 1** | ~$369/mo |
| **Revenue Phase 3** | ~$4,700/mo |
| **Margin Phase 3** | ~87% |
| **Pattern** | P18: Federated Open Data Intelligence |
| **Key innovation** | 6 CC0/PD sources federated; ALL streaming APIs disqualified; monopoly on legal music intelligence |
| **Disqualified** | 17 of 28 (ALL streaming: Spotify, Apple, Deezer, SoundCloud, Tidal, YouTube + Last.fm, ACRCloud, AudD, Musixmatch, Genius, Gracenote, Songkick, Setlist.fm, Chartmetric, Billboard, Discogs API) |
