# UC-XXX: [Provider Name]

## Meta

| Field | Value |
|-------|-------|
| **ID** | UC-XXX |
| **Provider** | [Company Name] |
| **Category** | [Category] |
| **Date Added** | YYYY-MM-DD |
| **Status** | Draft / Reference / Production |
| **Client** | [Client alias] |

## 1. Client Input Data

What the client provided to APIbase:

```
[List of credentials, keys, tokens provided by the client]
```

### Sufficiency Assessment

| Data provided | What it enables | Sufficient? |
|---------------|----------------|-------------|
| ... | ... | Yes/No |

## 2. Provider API Analysis

### API Architecture

| Service | Base URL | Auth | Description |
|---------|----------|------|-------------|
| ... | ... | ... | ... |

### Key Endpoints

| Endpoint | Method | Auth? | Description |
|----------|--------|-------|-------------|
| ... | ... | ... | ... |

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| ... | ... |

## 3. APIbase Wrapper Design

### Level 1: Protocol Adapter
[How the adapter normalizes the provider's API]

### Level 2: Semantic Normalizer
[Schema mapping: original → APIbase format]

### Level 3: Referral/Builder Key Injector
[How attribution/referral works]

## 4. MCP Tool Definitions

[JSON definitions of each MCP tool created]

## 5. AI Instructions

[Prompt document for AI agents]

## 6. Publication

### APIbase.pro Catalog Entry
[What appears in the catalog]

### GitHub Public Entry
[What goes to the public repo]

## 7. Traffic Flow Diagram

[ASCII diagram of request flow: Agent → APIbase → Provider]

## 8. Monetization Model

| Revenue stream | Mechanism | Expected |
|---------------|-----------|----------|
| ... | ... | ... |

## 9. Lessons Learned

[What we learned from this integration]
