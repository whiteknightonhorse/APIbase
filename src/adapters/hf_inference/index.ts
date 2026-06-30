import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  HfSentimentResponse,
  HfNerResponse,
  HfZeroShotResponse,
  HfTranslationResponse,
  HfSummarizationResponse,
} from './types';

/**
 * HuggingFace Inference API adapter (UC-547).
 *
 * Supported tools:
 *   hf_inference.sentiment   → cardiffnlp/twitter-roberta-base-sentiment-latest
 *   hf_inference.ner         → dbmdz/bert-large-cased-finetuned-conll03-english
 *   hf_inference.zero_shot   → facebook/bart-large-mnli
 *   hf_inference.translate   → Helsinki-NLP/opus-mt-{src}-{tgt}
 *   hf_inference.summarize   → facebook/bart-large-cnn
 *
 * Auth: Bearer token (PROVIDER_KEY_HF_INFERENCE). Free tier via HuggingFace user token.
 * Base: https://router.huggingface.co/hf-inference/models
 */
export class HfInferenceAdapter extends BaseAdapter {
  private readonly token: string;

  constructor(token: string) {
    super({
      provider: 'hf_inference',
      baseUrl: 'https://router.huggingface.co/hf-inference/models',
    });
    this.token = token;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };

    switch (req.toolId) {
      case 'hf_inference.sentiment': {
        const model =
          (p.model as string | undefined) ?? 'cardiffnlp/twitter-roberta-base-sentiment-latest';
        const url = `${this.baseUrl}/${encodeURIComponent(model)}`;
        return {
          url,
          method: 'POST',
          headers,
          body: JSON.stringify({ inputs: p.text as string }),
        };
      }

      case 'hf_inference.ner': {
        const model =
          (p.model as string | undefined) ?? 'dbmdz/bert-large-cased-finetuned-conll03-english';
        const url = `${this.baseUrl}/${encodeURIComponent(model)}`;
        return {
          url,
          method: 'POST',
          headers,
          body: JSON.stringify({ inputs: p.text as string }),
        };
      }

      case 'hf_inference.zero_shot': {
        const model = (p.model as string | undefined) ?? 'facebook/bart-large-mnli';
        const url = `${this.baseUrl}/${encodeURIComponent(model)}`;
        const candidateLabels = p.candidate_labels as string[];
        const multiLabel = (p.multi_label as boolean | undefined) ?? false;
        return {
          url,
          method: 'POST',
          headers,
          body: JSON.stringify({
            inputs: p.text as string,
            parameters: { candidate_labels: candidateLabels, multi_label: multiLabel },
          }),
        };
      }

      case 'hf_inference.translate': {
        const srcLang = (p.source_lang as string | undefined) ?? 'en';
        const tgtLang = p.target_lang as string;
        const model =
          (p.model as string | undefined) ?? `Helsinki-NLP/opus-mt-${srcLang}-${tgtLang}`;
        const url = `${this.baseUrl}/${encodeURIComponent(model)}`;
        return {
          url,
          method: 'POST',
          headers,
          body: JSON.stringify({ inputs: p.text as string }),
        };
      }

      case 'hf_inference.summarize': {
        const model = (p.model as string | undefined) ?? 'facebook/bart-large-cnn';
        const url = `${this.baseUrl}/${encodeURIComponent(model)}`;
        const parameters: Record<string, unknown> = {};
        if (p.max_length !== undefined) parameters.max_length = p.max_length as number;
        if (p.min_length !== undefined) parameters.min_length = p.min_length as number;
        return {
          url,
          method: 'POST',
          headers,
          body: JSON.stringify({
            inputs: p.text as string,
            parameters: Object.keys(parameters).length ? parameters : undefined,
          }),
        };
      }

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'hf_inference.sentiment':
        return this.parseSentiment(raw);

      case 'hf_inference.ner':
        return this.parseNer(raw);

      case 'hf_inference.zero_shot':
        return this.parseZeroShot(raw);

      case 'hf_inference.translate':
        return this.parseTranslation(raw);

      case 'hf_inference.summarize':
        return this.parseSummarization(raw);

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  private parseSentiment(raw: ProviderRawResponse): unknown {
    const body = raw.body as HfSentimentResponse;
    // API returns [[{label,score},...]] (nested) — flatten one level
    const results: HfSentimentResponse[0] = Array.isArray(body[0])
      ? body[0]
      : (body as unknown as HfSentimentResponse[0]);
    const sorted = [...results].sort((a, b) => b.score - a.score);
    return {
      label: sorted[0]?.label ?? 'unknown',
      score: sorted[0]?.score ?? 0,
      all_scores: sorted.map((r) => ({ label: r.label, score: r.score })),
    };
  }

  private parseNer(raw: ProviderRawResponse): unknown {
    const entities = raw.body as HfNerResponse;
    return {
      count: entities.length,
      entities: entities.map((e) => ({
        text: e.word,
        entity_type: e.entity_group,
        confidence: e.score,
        start: e.start,
        end: e.end,
      })),
    };
  }

  private parseZeroShot(raw: ProviderRawResponse): unknown {
    const body = raw.body as HfZeroShotResponse;
    const result = Array.isArray(body) ? body[0] : (body as unknown as HfZeroShotResponse[0]);
    if (!result?.labels?.length) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Zero-shot classification returned no labels',
        provider: this.provider,
        toolId: 'hf_inference.zero_shot',
        durationMs: 0,
      };
    }
    const paired = result.labels.map((label, i) => ({
      label,
      score: result.scores[i] ?? 0,
    }));
    const sorted = [...paired].sort((a, b) => b.score - a.score);
    return {
      predicted_label: sorted[0]?.label ?? '',
      confidence: sorted[0]?.score ?? 0,
      all_scores: sorted,
    };
  }

  private parseTranslation(raw: ProviderRawResponse): unknown {
    const body = raw.body as HfTranslationResponse;
    const result = Array.isArray(body) ? body[0] : (body as unknown as HfTranslationResponse[0]);
    return {
      translation: result?.translation_text ?? '',
    };
  }

  private parseSummarization(raw: ProviderRawResponse): unknown {
    const body = raw.body as HfSummarizationResponse;
    const result = Array.isArray(body) ? body[0] : (body as unknown as HfSummarizationResponse[0]);
    return {
      summary: result?.summary_text ?? '',
    };
  }
}
