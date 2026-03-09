# UC-017: OpenAlex + College Scorecard + PubMed + arXiv + Coursera (Education / Online Learning / Academic Research)

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-017 |
| **Provider** | OpenAlex (240M+ academic works, CC0) + College Scorecard (US DOE, 7K+ institutions) + PubMed/NCBI (36M+ biomedical citations) + arXiv (2.4M+ preprints, CC0) + Coursera (7K+ courses, affiliate) |
| **Category** | Education / Online Learning / Academic Research |
| **Date Added** | 2026-03-07 |
| **Status** | Reference |
| **Client** | APIbase (platform-level integration) |

---

## RESEARCH REPORT: UC-017 Education / Online Learning / Academic Research

---

# Phase 1: Comprehensive Candidate Discovery (28 Candidates Evaluated)

## 1.1 Online Course Platforms

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 1 | **Coursera** | Catalog API (free via affiliate) | $0 (affiliate) | 7,000+ courses, 15-45% affiliate commission |
| 2 | **Udemy** | Affiliate API **DISCONTINUED** 1/1/2025 | Affiliate active (10% via Impact) | 200K+ courses, 7-day cookie |
| 3 | **edX** | Catalog API (requires approval) | Enterprise pricing | 3,000+ courses, 10% affiliate commission |
| 4 | **Khan Academy** | API **DEPRECATED** since 2020 | N/A | Free platform, no public API |
| 5 | **Pluralsight** | Enterprise-only Skills API | Subscription required | B2B-only, no public catalog API |
| 6 | **Skillshare** | No public API | N/A | 40% affiliate commission |
| 7 | **LinkedIn Learning** | Enterprise-only API | Microsoft partnership | Redistribution explicitly prohibited |
| 8 | **Codecademy** | No public API | N/A | No developer program |
| 9 | **DataCamp** | No public API | N/A | Enterprise SDK terms restrict redistribution |
| 10 | **FutureLearn** | Partners-only API | N/A | UK-based, partner access only |
| 11 | **Udacity** | Course Catalog API exists | $0 (catalog only) | Nanodegree catalog metadata |
| 12 | **Treehouse** | No public API | N/A | No developer program |

## 1.2 Open Educational Resources (OER)

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 13 | **MIT OpenCourseWare** | CC BY-NC-SA licensed content | $0 | 2,500+ MIT courses, no formal API |
| 14 | **OpenStax** | CC BY licensed textbooks | $0 | 50+ free textbooks, commercial use allowed |
| 15 | **OER Commons** | API (token required) | $0 | 100K+ learning resources |
| 16 | **CK-12** | No public API | $0 (content) | K-12 textbooks, FlexBooks |

## 1.3 Academic/Research APIs

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 17 | **arXiv** | Free API (CC0 metadata) | $0 | 2.4M+ preprints, OAI-PMH + REST |
| 18 | **PubMed/NCBI** | E-utilities (free with key) | $0 (gov) | 36M+ biomedical citations |
| 19 | **Semantic Scholar** | Free API (rate limited) | $0 | 200M+ papers, AI-powered features |
| 20 | **CrossRef** | Free REST API (polite pool) | $0 | 150M+ DOIs, bibliographic metadata |
| 21 | **OpenAlex** | Free API (CC0, 100K/day) | $0 / Premium for high volume | 240M+ works, CC0 licensed |
| 22 | **CORE** | Free API (rate limited) | Enterprise paid | 300M+ papers, OA aggregator |
| 23 | **Unpaywall** | 100K calls/day (email auth) | $0 / Premium data feed | OA link finder for 30M+ DOIs |
| 24 | **DOAJ** | Free API (CC0 metadata) | $0 (until March 2026 changes) | 21K+ OA journals indexed |

## 1.4 University/Education Statistics

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 25 | **College Scorecard (US DOE)** | Free API (data.gov key) | $0 (gov open data) | 7K+ US institutions, outcomes data |
| 26 | **IPEDS/NCES** | Bulk downloads (CSV) | $0 (gov) | Comprehensive US postsecondary stats |
| 27 | **UNESCO UIS** | Free API (no auth) | $0 (int'l org) | Global education stats, 200+ countries |

## 1.5 Supplementary Knowledge

| # | Candidate | Free Tier | Pricing | Key Feature |
|---|-----------|-----------|---------|-------------|
| 28 | **Wikidata** | Free SPARQL + REST (CC0) | $0 | Structured knowledge, CC0 license |

---

# Phase 2: Evaluation Matrix (12 Parameters, Max 245 Points)

## Scoring Scale
- 5 = Exceptional / Best-in-class
- 4 = Very good
- 3 = Good / Average
- 2 = Below average / Limitations
- 1 = Poor / Major issues
- 0 = Disqualified

---

### Candidate A: OpenAlex (Academic Knowledge Graph)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | CC0 data, free API key, $1/day free usage |
| Data Coverage / Depth | **5** | x4 | **20** | 240M+ works, authors, institutions, venues, concepts |
| API Quality | **5** | x3 | **15** | Excellent REST/JSON, comprehensive filters, pagination |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate program; research infrastructure |
| Agent Utility | **5** | x5 | **25** | Comprehensive research discovery, citation analysis, trends |
| ToS Compatibility | **5** | x5 | **25** | **CC0 license** — "free to use in any way you like", no restrictions |
| MCP Ecosystem | **5** | x3 | **15** | Multiple MCP servers (alex-mcp, openalex-mcp, ScholarScope, etc.) |
| Unique Features | **5** | x4 | **20** | Concepts taxonomy, institution matching, author disambiguation |
| New Pattern Potential | **4** | x5 | **20** | Academic intelligence layer, skill-to-research mapping |
| Cache Potential | **5** | x3 | **15** | Scholarly data stable, excellent cache characteristics |
| Cross-UC Synergy | **4** | x4 | **16** | UC-015 Jobs: research-to-skills mapping |
| Market Position | **4** | x3 | **12** | Successor to Microsoft Academic Graph, growing rapidly |
| **TOTAL** | | | **213/245** | |

---

### Candidate B: College Scorecard (US DOE)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | Free government API, data.gov key |
| Data Coverage / Depth | **5** | x4 | **20** | 7K+ US institutions, costs, outcomes, admissions, programs |
| API Quality | **4** | x3 | **12** | REST/JSON, data.gov infrastructure, good docs |
| Affiliate / Revenue Opp | **2** | x5 | **10** | No direct affiliate, enables course platform affiliate routing |
| Agent Utility | **5** | x5 | **25** | College comparison, cost analysis, outcome prediction |
| ToS Compatibility | **5** | x5 | **25** | **Government open data** — CC-BY, free use/reuse/redistribution |
| MCP Ecosystem | **1** | x3 | **3** | No known MCP servers |
| Unique Features | **5** | x4 | **20** | Earnings outcomes, debt-to-earnings, completion rates by program |
| New Pattern Potential | **5** | x5 | **25** | Education decision engine: "Should I attend X for Y program?" |
| Cache Potential | **5** | x3 | **15** | Annual data updates, extremely cacheable |
| Cross-UC Synergy | **5** | x4 | **20** | UC-015 Jobs: education ROI vs. career earnings; UC-016: financial planning |
| Market Position | **5** | x3 | **15** | THE authoritative US higher education data source |
| **TOTAL** | | | **215/245** | **HIGHEST SCORE** |

---

### Candidate C: PubMed/NCBI (Biomedical Literature)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | Free gov API, key optional (higher rate with key) |
| Data Coverage / Depth | **5** | x4 | **20** | 36M+ biomedical citations, abstracts, MeSH terms |
| API Quality | **4** | x3 | **12** | E-utilities REST, XML/JSON, well-documented by NLM |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate; government service |
| Agent Utility | **5** | x5 | **25** | Medical research, drug information, clinical evidence |
| ToS Compatibility | **4** | x5 | **20** | Gov data, free to use; per-article copyright varies (metadata OK) |
| MCP Ecosystem | **5** | x3 | **15** | Multiple PubMed MCP servers (cyanheads, jackkuo666, etc.) |
| Unique Features | **5** | x4 | **20** | MeSH taxonomy, PMC Open Access subset |
| New Pattern Potential | **3** | x5 | **15** | Medical evidence pattern; synergy with UC-011 Health |
| Cache Potential | **5** | x3 | **15** | Citation metadata highly cacheable |
| Cross-UC Synergy | **4** | x4 | **16** | UC-011 Health: drug/nutrition research evidence |
| Market Position | **5** | x3 | **15** | THE biomedical database, US government authority |
| **TOTAL** | | | **203/245** | |

---

### Candidate D: arXiv (Academic Preprints)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | 100% free, no API key required |
| Data Coverage / Depth | **5** | x4 | **20** | 2.4M+ preprints across physics, CS, math, biology, etc. |
| API Quality | **4** | x3 | **12** | REST + OAI-PMH, Atom/XML responses, well-documented |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate program; non-profit |
| Agent Utility | **5** | x5 | **25** | Research paper discovery, citation analysis, literature review |
| ToS Compatibility | **4** | x5 | **20** | **METADATA = CC0** (commercial OK); full-text = copyright holder |
| MCP Ecosystem | **5** | x3 | **15** | Multiple existing MCP servers (blazickjp, kelvingao, etc.) |
| Unique Features | **5** | x4 | **20** | Preprint server, latest research before journal publication |
| New Pattern Potential | **3** | x5 | **15** | Metadata enrichment pattern |
| Cache Potential | **5** | x3 | **15** | Paper metadata highly cacheable; rarely changes |
| Cross-UC Synergy | **3** | x4 | **12** | Research intelligence |
| Market Position | **5** | x3 | **15** | THE preprint server, authoritative |
| **TOTAL** | | | **199/245** | |

---

### Candidate E: Coursera (Catalog API + Affiliate)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **4** | x5 | **20** | Free catalog API via developer/affiliate program |
| Data Coverage / Depth | **5** | x4 | **20** | 7,000+ courses, specializations, professional certificates |
| API Quality | **3** | x3 | **9** | RESTful JSON, limited documentation, catalog-only |
| Affiliate / Revenue Opp | **5** | x5 | **25** | **15-45% commission**, 30-day cookie, Impact network |
| Agent Utility | **4** | x5 | **20** | Course discovery, recommendations highly valuable for agents |
| ToS Compatibility | **2** | x5 | **10** | Non-transferable; commercial OK **only through affiliate program** |
| MCP Ecosystem | **1** | x3 | **3** | No existing Coursera MCP servers |
| Unique Features | **4** | x4 | **16** | University partnerships, professional certificates, degrees |
| New Pattern Potential | **4** | x5 | **20** | Affiliate commission on course enrollments from agent recommendations |
| Cache Potential | **3** | x3 | **9** | Catalog metadata cacheable; course details update weekly |
| Cross-UC Synergy | **5** | x4 | **20** | UC-015 Jobs: skill gap → course recommendation is THE killer app |
| Market Position | **5** | x3 | **15** | Market leader in online education, 100M+ learners |
| **TOTAL** | | | **187/245** | |

---

### Candidate F: Wikidata (Structured Knowledge)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | Free SPARQL + REST, no auth required |
| Data Coverage / Depth | **5** | x4 | **20** | 100M+ items, universities, courses, skills, everything |
| API Quality | **3** | x3 | **9** | SPARQL powerful but complex; REST simpler |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate; Wikimedia Foundation |
| Agent Utility | **4** | x5 | **20** | Entity resolution, relationship discovery, knowledge enrichment |
| ToS Compatibility | **5** | x5 | **25** | **CC0** — "No rights reserved", commercial use explicitly allowed |
| MCP Ecosystem | **3** | x3 | **9** | Some Wikidata MCP implementations exist |
| Unique Features | **5** | x4 | **20** | Cross-linked knowledge graph, multilingual, entity relationships |
| New Pattern Potential | **3** | x5 | **15** | Knowledge enrichment layer for all UCs |
| Cache Potential | **4** | x3 | **12** | Entity data stable, good caching |
| Cross-UC Synergy | **5** | x4 | **20** | Universal enrichment: every UC can use Wikidata entities |
| Market Position | **5** | x3 | **15** | Largest free structured knowledge base |
| **TOTAL** | | | **195/245** | |

---

### Candidate G: CrossRef (Bibliographic Metadata)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | Free public API, polite pool with email |
| Data Coverage / Depth | **5** | x4 | **20** | 150M+ DOIs, scholarly metadata |
| API Quality | **5** | x3 | **15** | Excellent REST/JSON, comprehensive docs |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate; non-profit infrastructure |
| Agent Utility | **4** | x5 | **20** | DOI resolution, citation metadata, publication lookup |
| ToS Compatibility | **4** | x5 | **20** | Metadata = "facts" = CC0/public domain. Abstracts = publisher copyright |
| MCP Ecosystem | **2** | x3 | **6** | Limited existing MCP servers |
| Unique Features | **4** | x4 | **16** | DOI system, Funder Registry, citation links |
| New Pattern Potential | **3** | x5 | **15** | DOI enrichment pattern |
| Cache Potential | **5** | x3 | **15** | Metadata rarely changes, highly cacheable |
| Cross-UC Synergy | **3** | x4 | **12** | Academic research enrichment |
| Market Position | **5** | x3 | **15** | THE DOI registry, foundational scholarly infrastructure |
| **TOTAL** | | | **184/245** | |

---

### Candidate H: UNESCO UIS (Global Education Stats)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **5** | x5 | **25** | Free API, no authentication required |
| Data Coverage / Depth | **4** | x4 | **16** | 200+ countries, education indicators from 1970 |
| API Quality | **3** | x3 | **9** | REST API, some complexity, 100K record limit |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate; international organization |
| Agent Utility | **3** | x5 | **15** | Global education statistics, country comparisons |
| ToS Compatibility | **4** | x5 | **20** | Open data, encourages developer use |
| MCP Ecosystem | **1** | x3 | **3** | No known MCP servers |
| Unique Features | **4** | x4 | **16** | Only source for global education statistics |
| New Pattern Potential | **2** | x5 | **10** | Supplementary data |
| Cache Potential | **5** | x3 | **15** | Annual data, highly cacheable |
| Cross-UC Synergy | **3** | x4 | **12** | UC-016: World Bank data synergy |
| Market Position | **4** | x3 | **12** | UN-backed authority |
| **TOTAL** | | | **158/245** | |

---

### Candidate I: Semantic Scholar (AI Research)

| Parameter | Raw (1-5) | Weight | Weighted | Justification |
|-----------|-----------|--------|----------|---------------|
| Free Tier / Pricing | **4** | x5 | **20** | Free tier, 1000 req/s shared |
| Data Coverage / Depth | **5** | x4 | **20** | 200M+ papers, AI-powered citations |
| API Quality | **5** | x3 | **15** | Excellent REST/JSON API |
| Affiliate / Revenue Opp | **1** | x5 | **5** | No affiliate |
| Agent Utility | **5** | x5 | **25** | AI-powered paper recommendations, TLDR summaries |
| ToS Compatibility | **1** | x5 | **5** | **DISQUALIFIED**: "selling, leasing, or licensing... for commercial gain of third parties" |
| MCP Ecosystem | **4** | x3 | **12** | Existing MCP servers |
| Unique Features | **5** | x4 | **20** | TLDR summaries, influential citations |
| New Pattern Potential | **2** | x5 | **10** | Cannot commercialize |
| Cache Potential | **4** | x3 | **12** | Paper data stable |
| Cross-UC Synergy | **3** | x4 | **12** | Research intelligence |
| Market Position | **4** | x3 | **12** | Allen AI flagship |
| **TOTAL** | | | **168/245** | **DISQUALIFIED** |

---

## Complete Scoring Ranking

| Rank | Candidate | Score (/245) | Status |
|------|-----------|--------------|--------|
| 1 | **College Scorecard** | **215** | CLEARED |
| 2 | **OpenAlex** | **213** | CLEARED |
| 3 | **PubMed/NCBI** | **203** | CLEARED |
| 4 | **arXiv** | **199** | CLEARED |
| 5 | **Wikidata** | **195** | CLEARED |
| 6 | **Coursera** | **187** | CONDITIONAL (affiliate only) |
| 7 | **CrossRef** | **184** | CLEARED |
| 8 | **Semantic Scholar** | **168** | DISQUALIFIED (ToS) |
| 9 | **UNESCO UIS** | **158** | CLEARED |
| 10 | **DOAJ** | **155** | CONDITIONAL |
| 11 | **edX** | **151** | CONDITIONAL |
| 12 | **IPEDS/NCES** | **140** | CONDITIONAL (no REST API) |
| 13 | **Unpaywall** | **135** | CONDITIONAL |
| 14 | **CORE** | **130** | CONDITIONAL |
| 15 | **OpenStax** | **110** | CONDITIONAL |
| 16 | **MIT OCW** | **95** | MARGINAL (NC restriction) |
| 17 | **OER Commons** | **90** | MARGINAL |
| 18 | **Udemy** | **90** | DISQUALIFIED (no API) |
| 19 | **Udacity** | **80** | MARGINAL |
| 20 | **Pluralsight** | **65** | DISQUALIFIED |
| 21 | **LinkedIn Learning** | **60** | DISQUALIFIED |
| 22 | **Skillshare** | **55** | DISQUALIFIED |
| 23 | **FutureLearn** | **55** | DISQUALIFIED |
| 24 | **DataCamp** | **50** | DISQUALIFIED |
| 25 | **Khan Academy** | **45** | DISQUALIFIED |
| 26 | **CK-12** | **45** | DISQUALIFIED |
| 27 | **Codecademy** | **40** | DISQUALIFIED |
| 28 | **Treehouse** | **35** | DISQUALIFIED |

---

# Phase 3: Terms of Service Deep Dive

## 3.1 CLEARED FOR USE (Green Light)

### OpenAlex — CC0 1.0 Universal (PUBLIC DOMAIN)
- **License**: CC0 1.0 — Public Domain Dedication
- **Exact clause**: *"OpenAlex data is made available under the CC0 license. That means it's in the public domain, and free to use in any way you like."*
- **Attribution**: "appreciated where it's convenient, but it's not at all necessary"
- **Redistribution**: UNRESTRICTED. CC0 means no copyright restrictions.
- **Proxy/Resale**: ALLOWED.
- **Commercial Use**: EXPLICITLY ALLOWED.
- **AI/LLM Use**: No restrictions.
- **Caching**: No restrictions.
- **API credits**: $1/day free, premium credits at volume
- **VERDICT**: **PERFECT ToS** — CC0 is the gold standard.

### College Scorecard — US Government Open Data
- **License**: Government Open Data, Creative Commons Attribution
- **Exact clause**: *"The College Scorecard data is provided under an open license that allows for free use, reuse, and redistribution."*
- **Redistribution**: UNRESTRICTED. Government open data.
- **Proxy/Resale**: ALLOWED. Federal government data is public domain.
- **Commercial Use**: ALLOWED.
- **AI/LLM Use**: No restrictions.
- **Caching**: No restrictions.
- **Rate Limits**: 1,000 req/IP/hour (manageable with caching)
- **VERDICT**: **EXCELLENT ToS** — follows BLS (UC-015), FRED (UC-016), USDA (UC-011) pattern.

### PubMed/NCBI — US Government Public Domain (metadata)
- **Exact clause**: *"All persons reproducing, redistributing, or making commercial use of this information are expected to adhere to the terms and conditions asserted by the copyright holder."*
- **Metadata** (titles, authors, abstracts, MeSH): Government data, freely redistributable.
- **Full text**: Per-article copyright varies.
- **PMC Open Access Subset**: CC0, CC BY, CC BY-SA, CC BY-ND — commercial allowed.
- **Redistribution**: ALLOWED for metadata. Per-article for full text.
- **VERDICT**: **CLEARED (METADATA ONLY)** — sufficient for search/discovery/citation/abstract access.

### arXiv — CC0 1.0 (metadata)
- **Exact clause**: *"You are free to use descriptive metadata about arXiv e-prints under the terms of the Creative Commons Universal (CC0 1.0) Public Domain Declaration."*
- **Exact clause 2**: *"Metadata for arXiv articles may be reused in non-commercial and commercial systems."*
- **Exact clause 3**: *"At this time, arXiv does not require that commercial projects sign an MOU."*
- **Redistribution**: UNRESTRICTED for metadata.
- **Commercial Use**: EXPLICITLY ALLOWED for metadata.
- **VERDICT**: **CLEARED (METADATA)** — CC0 metadata, commercial redistribution explicit.

### Wikidata — CC0 1.0 Universal
- **Exact clause**: *"All structured data from the main, Property, Lexeme, and EntitySchema namespace is available under the Creative Commons CC0 License."*
- **Exact clause 2**: *"These databases can be used for personal or commercial use, backups or offline use."*
- **Caveat**: Wikimedia API guidelines: *"Operators may not sublicense, lease, assign, or guarantee the availability or functionality of a Wikimedia Foundation-managed API to any third party."* — refers to API SERVICE, not DATA.
- **Implementation**: Cache locally, serve from APIbase infrastructure (not proxy raw SPARQL).
- **VERDICT**: **CLEARED (with cache pattern)** — data CC0, cache+serve model compliant.

### CrossRef — CC0 (facts/metadata)
- **Exact clause**: *"You can use and redistribute any metadata you retrieve with the Crossref REST API."*
- **Exact clause 2**: *"The majority of metadata is considered to be 'facts' which are not copyrightable and are thus in the public domain (CC0)."*
- **Caveat**: Abstracts are copyrighted — cannot redistribute abstracts freely.
- **Caching**: Encouraged — *"try caching data so you don't request the same data over and over"*
- **VERDICT**: **CLEARED (METADATA, NON-ABSTRACT)** — bibliographic facts freely redistributable.

### UNESCO UIS — International Organization Open Data
- **Key finding**: *"UIS encourages developers and researchers to build websites and applications that make rich use of UIS dissemination data."*
- **Free access, no authentication required.
- **VERDICT**: **CLEARED** — follows World Bank (UC-016) open data pattern.

## 3.2 CONDITIONAL

### Coursera — Affiliate Program Model
- **General ToS**: *"Any use of Coursera's Services for commercial purposes is strictly prohibited"* (absent written agreement).
- **Developer Agreement**: *"Coursera grants you a limited, personal, non-exclusive, non-transferable, and revocable license."*
- **Affiliate Program**: Explicitly designed for partners to promote courses and earn commissions. 15-45% commission, 30-day cookie, Impact network.
- **VERDICT**: **CONDITIONAL — AFFILIATE-ONLY** — Using catalog API within affiliate framework to surface course recommendations IS the intended use case. Direct data resale outside affiliate context prohibited.

### FRED API — Conditional (already used in UC-016)
- **2024 ToS update**: Prohibition on caching/archiving for redistribution.
- **Apps serving others**: Must link to FRED ToS.
- **VERDICT**: **CONDITIONAL** — real-time proxy pattern (pass-through) compliant. Already used in UC-016.

## 3.3 DISQUALIFIED (Red Light)

| # | Candidate | Score | EXACT Reason for Disqualification |
|---|-----------|-------|-----------------------------------|
| 1 | Semantic Scholar | 168/245 | ToS: "selling, leasing, or licensing the API... for commercial gain of third parties" |
| 2 | Udemy | 90/245 | API discontinued 1/1/2025 + ToS: "shall not redistribute, resale, and sublicense" |
| 3 | LinkedIn Learning | 60/245 | ToS: "cannot sell, rent, lease, disclose, distribute... to any third party" |
| 4 | Khan Academy | 45/245 | API deprecated since July 2020, no replacement |
| 5 | Pluralsight | 65/245 | Enterprise-only, no public catalog API |
| 6 | Skillshare | 55/245 | No public API exists |
| 7 | Codecademy | 40/245 | No public API, no developer program |
| 8 | DataCamp | 50/245 | No public API + redistribution prohibited in SDK terms |
| 9 | FutureLearn | 55/245 | Partner-only API, requires partnership agreement |
| 10 | Treehouse | 35/245 | No public API, no developer program |
| 11 | CK-12 | 45/245 | No public API |
| 12 | MIT OCW | 95/245 | CC BY-**NC**-SA — non-commercial restriction kills proxy/resale model |

---

# Phase 4: Winner Recommendation

## THE WINNING STRATEGY: Government/Open Data Academic Intelligence + Affiliate Monetization

### Primary Stack (5 sources, $0 upstream):

```
Provider Stack:              Role:                          License:
---------------------------------------------------------------------
OpenAlex                     240M+ academic works, concepts  CC0 (Public Domain)
College Scorecard (US DOE)   7K+ US institutions, outcomes   Gov Open Data (CC-BY)
PubMed/NCBI                  36M+ biomedical citations       Gov Public Domain
arXiv                        2.4M+ preprints                 CC0 (metadata)
Coursera (affiliate)         7K+ courses, 15-45% commission  Affiliate Program
```

### Enrichment Sources (3 supplementary):

```
CrossRef                     150M+ DOIs, citation metadata   CC0 (facts)
Wikidata                     University entities, knowledge  CC0
UNESCO UIS                   Global education statistics     Open Data
```

## Why This Stack Wins

```
STRATEGIC ADVANTAGES:
=====================

1. $0 UPSTREAM COST (sixth UC with ~100% margin)
   - OpenAlex = CC0, free. College Scorecard = gov, free. PubMed = gov, free.
   - arXiv = CC0, free. Coursera catalog = affiliate, free.
   - Break-even = infrastructure cost only (~$50/month)

2. FOUR CC0 SOURCES (record among all UCs)
   - OpenAlex, arXiv metadata, Wikidata, CrossRef metadata = all CC0/public domain
   - Combined with government data = strongest ToS portfolio alongside UC-016

3. BIDIRECTIONAL CROSS-UC SYNERGY (unique to UC-017)
   - UC-015 → UC-017: Job skills gap → course recommendations
   - UC-017 → UC-015: Course completion → job search
   - UC-011 → UC-017: Health query → PubMed evidence
   - UC-017 → UC-016: Education ROI → financial planning

4. AFFILIATE REVENUE DOMINANCE
   - Coursera 15-45% commission on enrollments
   - Single professional certificate enrollment = $90 (45% of $200)
   - = equivalent to 45,000 x402 calls at $0.002
   - Education has highest affiliate payouts in tech industry

5. COMPLETE LEARNING LIFECYCLE
   - From "What skills do I need?" (UC-015 O*NET)
   - Through "What courses teach them?" (Coursera)
   - To "What do graduates earn?" (College Scorecard)
   - Plus "What's the latest research?" (OpenAlex/arXiv/PubMed)

6. MASSIVE MCP ECOSYSTEM DEMAND
   - OpenAlex, arXiv, PubMed all have multiple existing MCP servers
   - Proves strong AI agent demand for academic data
   - APIbase becomes unified education + research intelligence layer
```

---

# Phase 5: Seven Proposed MCP Tools

### Tool 1: `education_search_courses`
```json
{
  "name": "education_search_courses",
  "description": "Search 7,000+ online courses across Coursera catalog. Returns course metadata with affiliate enrollment links. Filter by subject, skill, level, duration, and provider. Ideal for skill-gap-to-course recommendations.",
  "parameters": {
    "query": "machine learning",
    "subject": "computer-science",
    "level": "beginner | intermediate | advanced | mixed",
    "duration_weeks_max": 12,
    "type": "course | specialization | professional-certificate | guided-project",
    "limit": 10
  },
  "x402_price": "$0.003 per search",
  "cache_ttl": "24 hours",
  "upstream": "Coursera Catalog API (affiliate program)",
  "revenue_model": "x402 per-call + 15-45% affiliate commission on enrollments"
}
```

### Tool 2: `education_research_papers`
```json
{
  "name": "education_research_papers",
  "description": "Search 240M+ academic papers via OpenAlex. Returns paper metadata: title, authors, abstract, citations, concepts, open access links. Enriched with arXiv preprint data and CrossRef DOI metadata when available.",
  "parameters": {
    "query": "transformer architecture attention mechanism",
    "concept": "C41008148",
    "author": "author name or OpenAlex ID",
    "institution": "institution name or ROR ID",
    "year_from": 2020,
    "year_to": 2026,
    "open_access_only": false,
    "sort": "relevance | cited_by_count | publication_date",
    "limit": 10
  },
  "x402_price": "$0.002 per search",
  "cache_ttl": "12 hours",
  "upstream": "OpenAlex API (CC0) + arXiv API (CC0 metadata) + CrossRef (CC0 facts)"
}
```

### Tool 3: `education_college_compare`
```json
{
  "name": "education_college_compare",
  "description": "Compare US colleges using College Scorecard data: costs, graduation rates, earnings outcomes (1/3/5/10 year), admissions, debt-to-earnings, program-level statistics. Compare up to 5 institutions. Enriched with Wikidata.",
  "parameters": {
    "school_name": "MIT",
    "school_ids": [166683, 243744],
    "program": "Computer Science",
    "state": "MA",
    "metrics": ["cost", "earnings", "graduation_rate", "admissions", "debt"]
  },
  "x402_price": "$0.003 per comparison",
  "cache_ttl": "7 days (annual data)",
  "upstream": "College Scorecard API (US DOE, government open data) + Wikidata (CC0)"
}
```

### Tool 4: `education_skill_to_courses`
```json
{
  "name": "education_skill_to_courses",
  "description": "THE KILLER CROSS-UC TOOL: Maps occupation skills (from UC-015 O*NET/ESCO) to relevant courses. Input job title or skill list, get courses that teach those skills. Includes salary context (BLS) and affiliate enrollment links.",
  "parameters": {
    "occupation": "Software Developer or O*NET code 15-1252.00",
    "skills": ["Python", "Machine Learning", "SQL"],
    "skill_gap_only": false,
    "include_salary_context": true,
    "level": "beginner | intermediate | advanced",
    "limit": 10
  },
  "x402_price": "$0.005 per request (premium cross-UC)",
  "cache_ttl": "24 hours",
  "upstream": "O*NET (UC-015) + ESCO (UC-015) + Coursera Catalog + College Scorecard + BLS (UC-015)",
  "revenue_model": "x402 per-call + Coursera affiliate 15-45%"
}
```

### Tool 5: `education_medical_evidence`
```json
{
  "name": "education_medical_evidence",
  "description": "Search 36M+ biomedical citations via PubMed/NCBI. Returns citations, abstracts, MeSH terms, open access links. Optimized for clinical evidence, drug research, health education. Cross-UC with UC-011 Health.",
  "parameters": {
    "query": "metformin diabetes type 2",
    "mesh_terms": ["Diabetes Mellitus", "Metformin"],
    "publication_type": "review | clinical-trial | meta-analysis | case-report | any",
    "date_from": "2020/01/01",
    "date_to": "2026/12/31",
    "open_access_only": false,
    "limit": 10
  },
  "x402_price": "$0.002 per search",
  "cache_ttl": "24 hours",
  "upstream": "PubMed/NCBI E-utilities (US Government)"
}
```

### Tool 6: `education_institution_stats`
```json
{
  "name": "education_institution_stats",
  "description": "Comprehensive education statistics for institutions worldwide. US: College Scorecard + IPEDS. Global: UNESCO UIS. Enriched with Wikidata (founding year, notable alumni, affiliations). University comparison tool.",
  "parameters": {
    "institution": "Stanford University",
    "country": "US",
    "indicator": "UNESCO indicator code",
    "include_wikidata": true
  },
  "x402_price": "$0.003 per request",
  "cache_ttl": "7 days",
  "upstream": "College Scorecard + UNESCO UIS + Wikidata (CC0)"
}
```

### Tool 7: `education_learning_path`
```json
{
  "name": "education_learning_path",
  "description": "Generate personalized learning path from current skills to target career. Combines O*NET/ESCO skills analysis, Coursera course recommendations, College Scorecard education ROI, and OpenAlex research trends. The ultimate cross-UC enrichment tool.",
  "parameters": {
    "current_role": "Junior Developer",
    "target_role": "Machine Learning Engineer",
    "current_skills": ["Python", "SQL", "REST APIs"],
    "budget_usd": 500,
    "time_horizon_months": 6,
    "include_formal_education": true,
    "location": "San Francisco, CA"
  },
  "x402_price": "$0.008 per path (premium multi-source fusion)",
  "cache_ttl": "12 hours",
  "upstream": "O*NET + ESCO (UC-015) + Coursera + College Scorecard + OpenAlex + BLS (UC-015)",
  "revenue_model": "x402 per-call (premium) + Coursera affiliate + cross-UC upsell"
}
```

---

# Phase 6: Revenue Model

## 6.1 Upstream Costs

| Source | Monthly Cost | Notes |
|--------|-------------|-------|
| OpenAlex | $0-30 | Free tier = $1/day. Premium credits at volume. |
| College Scorecard | $0 | Government API, completely free |
| PubMed/NCBI | $0 | Government API, completely free |
| arXiv | $0 | Free API, no costs |
| Coursera Catalog | $0 | Free through affiliate/developer program |
| CrossRef | $0 | Free polite pool API |
| Wikidata | $0 | Free CC0 data (cache locally) |
| UNESCO UIS | $0 | Free API |
| **TOTAL UPSTREAM** | **$0-30/mo** | Sixth UC with near-zero upstream cost |

## 6.2 Revenue Projections

### Phase 1 (Month 1-3): Launch — 3K req/day

| Stream | Revenue |
|--------|---------|
| x402 tool revenue | $282/mo |
| Coursera affiliate | $1,000/mo |
| Cross-UC enrichment | $0 |
| **TOTAL** | **$1,282/mo** |

### Phase 2 (Month 4-9): Growth — 10K req/day

| Stream | Revenue |
|--------|---------|
| x402 tool revenue | $846/mo |
| Coursera affiliate | $5,000/mo |
| edX affiliate (added) | $200/mo |
| Cross-UC enrichment | $250/mo |
| **TOTAL** | **$6,296/mo** |

### Phase 3 (Month 10-18): Scale — 30K req/day

| Stream | Revenue |
|--------|---------|
| x402 tool revenue | $1,974/mo |
| Coursera affiliate | $10,550/mo |
| edX affiliate | $500/mo |
| Cross-UC enrichment | $600/mo |
| **TOTAL** | **$13,624/mo** |

## 6.3 Affiliate Revenue Breakdown (Phase 3)

| Affiliate Source | Commission | Conv. Rate | Monthly Volume | Revenue |
|-----------------|-----------|------------|----------------|---------|
| Coursera courses (20% avg) | $6 avg | 3% | 15K clicks → 450 enrollments | $2,700/mo |
| Coursera specializations (45%) | $36 avg | 2% | 5K clicks → 100 enrollments | $3,600/mo |
| Coursera professional certs (45%) | $90 avg | 1.5% | 3K clicks → 45 enrollments | $4,050/mo |
| edX certificates (10%) | $5 avg | 2% | 2K clicks → 40 enrollments | $200/mo |
| **TOTAL AFFILIATE** | | | | **$10,550/mo** |

**Key insight**: Affiliate revenue ($10,550) >> x402 revenue ($1,974) at Phase 3. x402 tools are the DISCOVERY ENGINE driving high-value affiliate conversions.

## 6.4 Cross-UC Enrichment Revenue

| Cross-UC Flow | Description | Revenue Impact |
|---------------|-------------|----------------|
| UC-015 → UC-017 | Job skills gap → course recommendations | +30% UC-017 call volume |
| UC-017 → UC-015 | Course completion → job search | +15% UC-015 call volume |
| UC-011 → UC-017 | Health query → PubMed evidence | +20% medical_evidence calls |
| UC-017 → UC-016 | Education ROI → financial planning | +10% UC-016 call volume |

## 6.5 Break-Even Analysis

| Metric | Value |
|--------|-------|
| Total upstream cost | $0-30/month |
| Infrastructure | ~$50-200/month |
| Break-even | **Day 1** ($0 upstream, any x402 call covers infra) |
| Affiliate break-even | Month 2 (once Coursera affiliate approved) |
| Margin at Phase 1 | ~96% |
| Margin at Phase 3 | ~98.5% |

---

# Phase 7: Monetization Pattern P17

## P17: Education Intelligence Funnel

**UC:** UC-017 OpenAlex + College Scorecard + PubMed + arXiv + Coursera
**Core Strategy:** Monetize the complete learning lifecycle: skill identification → course enrollment → career outcome. Free government/open data as the intelligence layer, course platform affiliates as the revenue engine. Bidirectional cross-UC synergy with UC-015 Jobs.

### Sub-pattern: Skill-Gap-to-Course Pipeline (P17a)
```
Input:  Job title or skill assessment from UC-015 O*NET/ESCO
Process: O*NET skills → match to Coursera/edX courses → rank by relevance, rating, ROI
Output:  Personalized course recommendations with affiliate links
Revenue: 15-45% commission per enrollment

UC-015 ENDS at job listings. P17a EXTENDS the funnel backward to education.
```

### Sub-pattern: Education ROI Calculator (P17b)
```
Input:  University + program from College Scorecard
Process: Tuition cost vs. median earnings at 1/3/5/10 years post-graduation
Output:  ROI percentage, breakeven timeline, debt-to-earnings ratio
Revenue: x402 per-call + upsell to course recs if formal education ROI is poor

No other UC provides education ROI analysis. Entirely new territory.
```

### Sub-pattern: Research Intelligence Layer (P17c)
```
Input:  Academic topic or research question
Process: OpenAlex 240M works + arXiv preprints + PubMed citations + CrossRef DOIs
Output:  Literature summaries, citation networks, trend analysis, open access links
Revenue: x402 per-call (high volume, research-heavy agents)

While P11 aggregates government nutrition data,
P17c aggregates academic research across ALL domains.
```

### Sub-pattern: Cross-UC Education Enrichment (P17d)
```
Detect education opportunity in OTHER UC queries → inject course recommendation:

UC-011 Health: "How does metformin work?"
  → PubMed evidence + Coursera pharmacology course

UC-015 Jobs: "What does a data scientist do?"
  → Required skills + courses to learn them + graduate earnings

UC-016 Finance: "What's ROI on an MBA?"
  → College Scorecard earnings data for top MBA programs

Revenue: Affiliate commission on cross-UC upsells
```

### P17 vs. Previous Patterns

| Dimension | P11 (Gov Data) | P15 (Career) | P16 (Finance) | **P17 (Education)** |
|-----------|---------------|-------------|--------------|-------------------|
| Data | USDA nutrition | BLS/O*NET | FRED/ECB | OpenAlex/Scorecard/PubMed |
| Revenue engine | x402 only | CareerJet CPC | x402 + fintech | **Coursera affiliate 15-45%** |
| Upstream | $0 | $0 | $0 | **$0** |
| Affiliate | Supplements | Job CPC | Fintech | **Education 15-45%** |
| Cross-UC | Low | Medium | Medium | **HIGHEST (bidirectional)** |
| Lifecycle | One-shot | Job search | Financial analysis | **Complete learning lifecycle** |

---

# Phase 8: Architecture Summary

```
                    UC-017 ARCHITECTURE
    ┌─────────────────────────────────────────────┐
    │              APIbase Layer                    │
    │                                              │
    │   ┌─────────────────────────────────────┐   │
    │   │         7 MCP Tools                  │   │
    │   │  search_courses    research_papers    │   │
    │   │  college_compare   skill_to_courses   │   │
    │   │  medical_evidence  institution_stats  │   │
    │   │  learning_path                        │   │
    │   └──────────────┬──────────────────────┘   │
    │                  │                           │
    │   ┌──────────────┴──────────────────────┐   │
    │   │      Intelligence Fusion Layer        │   │
    │   │  OpenAlex + arXiv + PubMed + CrossRef │   │
    │   │  College Scorecard + UNESCO + Wikidata│   │
    │   │  + Coursera Catalog (affiliate)       │   │
    │   └──────────────┬──────────────────────┘   │
    │                  │                           │
    │   ┌──────────────┴──────────────────────┐   │
    │   │         Cache Layer                   │   │
    │   │  Papers: 12-24h    Institutions: 7d   │   │
    │   │  Courses: 24h      DOIs: permanent    │   │
    │   │  Education stats: 30-365d             │   │
    │   └──────────────────────────────────────┘   │
    └─────────────────────────────────────────────┘
                       │
         ┌─────────────┼────────────────┐
         │             │                │
    ┌────┴────┐  ┌────┴─────┐  ┌──────┴──────┐
    │OpenAlex │  │College   │  │  PubMed     │
    │ CC0     │  │Scorecard │  │  US Gov     │
    │240M wrks│  │US DOE    │  │  36M cites  │
    └─────────┘  └──────────┘  └─────────────┘
         │             │                │
    ┌────┴────┐  ┌────┴─────┐  ┌──────┴──────┐
    │ arXiv   │  │Coursera  │  │ CrossRef    │
    │CC0 meta │  │Affiliate │  │ CC0 facts   │
    │2.4M ppr │  │15-45%    │  │ 150M DOIs   │
    └─────────┘  └──────────┘  └─────────────┘

    Cross-UC Connections:
    ←→ UC-015 Jobs:   skill gap ↔ courses (BIDIRECTIONAL)
    ←  UC-011 Health: health query → PubMed evidence
    →  UC-016 Finance: education ROI → financial planning
    ←  UC-012 Maps:   location → institution proximity
```

---

# Phase 9: Cross-UC Synergy Map

| Partner UC | Direction | Integration | Revenue Impact |
|-----------|-----------|-------------|----------------|
| **UC-015 Jobs** | **↔ Bidirectional** | O*NET skills → Coursera courses → job search | **+30% UC-017, +15% UC-015** |
| UC-011 Health | ← Inbound | Health query → PubMed evidence enrichment | +20% medical_evidence calls |
| UC-016 Finance | → Outbound | Education ROI → financial planning | +10% UC-016 calls |
| UC-012 Maps | ← Inbound | Location → nearby institutions | +5% institution_stats calls |
| UC-007 Translation | ← Inbound | Translate research abstracts | +5% paper queries |
| UC-006 News | ← Inbound | Research news → academic context | +5% general enrichment |

**UC-015 Jobs is THE killer connection**: "What skills do I need?" (O*NET) → "What courses teach them?" (Coursera) → "What do graduates earn?" (College Scorecard) → "Find me a job" (CareerJet). Complete career development pipeline spanning two UCs.

---

## Summary

| Metric | Value |
|--------|-------|
| **Winners** | OpenAlex (213) + College Scorecard (215) + PubMed (203) + arXiv (199) + Coursera (187) |
| **Upstream cost** | $0/mo (all free/open/gov) |
| **Revenue Phase 1** | ~$1,282/mo |
| **Revenue Phase 3** | ~$13,624/mo |
| **Margin** | 96% → 98.5% |
| **Pattern** | P17: Education Intelligence Funnel |
| **Key innovation** | Bidirectional cross-UC with UC-015, affiliate-dominant revenue |
| **Disqualified** | 16 of 28 candidates (Semantic Scholar, Udemy, LinkedIn Learning, Khan Academy, MIT OCW NC restriction, etc.) |
