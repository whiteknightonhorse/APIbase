# UC-547 — HuggingFace Inference NLP

## Meta

| Field | Value |
|-------|-------|
| UC ID | UC-547 |
| Provider | HuggingFace Inference API |
| Category | developer |
| Date | 2026-06-30 |
| Status | LIVE |
| Tools | 5 |
| Auth | Bearer token (PROVIDER_KEY_HF_INFERENCE) |

## Provider Overview

HuggingFace Inference API provides serverless NLP inference via the Router endpoint
(`https://router.huggingface.co/hf-inference/models/{model}`). Users authenticate
with a HuggingFace User Access Token (`hf_...`). The free tier allows approximately
30,000 requests/month per model; Pro plan provides higher throughput and SLA.

## Client Credentials

| Credential | .env Key | Notes |
|-----------|---------|-------|
| User Access Token | `PROVIDER_KEY_HF_INFERENCE` | Starts with `hf_`, HuggingFace free tier |

## Verified Live Endpoints

| Endpoint | HTTP | Model |
|---------|------|-------|
| `POST .../cardiffnlp/twitter-roberta-base-sentiment-latest` | 200 | Sentiment analysis |
| `POST .../dbmdz/bert-large-cased-finetuned-conll03-english` | 200 | Named entity recognition |
| `POST .../facebook/bart-large-mnli` | 200 | Zero-shot classification |
| `POST .../Helsinki-NLP/opus-mt-en-fr` | 200 | Translation (EN→FR) |
| `POST .../facebook/bart-large-cnn` | 200 | Summarization |

Note: `api-inference.huggingface.co` has no DNS from Hetzner DE. Use `router.huggingface.co`.

## Tool Mapping

| toolId | mcpName | Model | Price | TTL |
|--------|---------|-------|-------|-----|
| `hf_inference.sentiment` | `hf_inference.nlp.sentiment` | cardiffnlp/twitter-roberta-base-sentiment-latest | $0.002 | 300s |
| `hf_inference.ner` | `hf_inference.nlp.ner` | dbmdz/bert-large-cased-finetuned-conll03-english | $0.002 | 300s |
| `hf_inference.zero_shot` | `hf_inference.nlp.zero_shot` | facebook/bart-large-mnli | $0.003 | 300s |
| `hf_inference.translate` | `hf_inference.nlp.translate` | Helsinki-NLP/opus-mt-{src}-{tgt} | $0.002 | 3600s |
| `hf_inference.summarize` | `hf_inference.nlp.summarize` | facebook/bart-large-cnn | $0.003 | 300s |

## Pricing Rationale

| Tool | Upstream cost | Our price | Margin |
|------|--------------|-----------|--------|
| sentiment | $0 (free tier) | $0.002 | ~100% |
| ner | $0 (free tier) | $0.002 | ~100% |
| zero_shot | $0 (free tier) | $0.003 | ~100% |
| translate | $0 (free tier) | $0.002 | ~100% |
| summarize | $0 (free tier) | $0.003 | ~100% |

Higher price for zero_shot and summarize reflects larger BART models (more GPU compute).

## Implementation Files

| File | Description |
|------|-------------|
| `src/adapters/hf_inference/types.ts` | Raw API response types |
| `src/adapters/hf_inference/index.ts` | HfInferenceAdapter class |
| `src/schemas/hf_inference.schema.ts` | Zod schemas (all fields with .describe()) |

## Registry Case

```
toolId.split('.')[0] = 'hf_inference'  →  case 'hf_inference':  in registry.ts
```

## Notes

- Text generation (gpt2) is NOT supported by the router endpoint (returns 400 "Model not supported by provider hf-inference").
- Translation uses dynamic model selection: adapter builds `Helsinki-NLP/opus-mt-{source_lang}-{target_lang}`.
- Zero-shot router returns `[{sequence, labels, scores}]` (array-wrapped); adapter unwraps.
- Sentiment router returns `[[{label, score}]]` (nested array); adapter flattens.
