/** Raw response from HuggingFace Inference API — Sentiment Analysis */
export interface HfSentimentResult {
  label: string;
  score: number;
}

/** Sentiment endpoint returns an array of arrays (one per input) */
export type HfSentimentResponse = HfSentimentResult[][];

/** Raw response from HuggingFace Inference API — Named Entity Recognition */
export interface HfNerEntity {
  entity_group: string;
  score: number;
  word: string;
  start: number;
  end: number;
}

export type HfNerResponse = HfNerEntity[];

/** Raw response from HuggingFace Inference API — Zero-shot Classification
 *  Note: The router returns an ARRAY wrapping the single result object.
 */
export interface HfZeroShotResult {
  sequence: string;
  labels: string[];
  scores: number[];
}

export type HfZeroShotResponse = HfZeroShotResult[];

/** Raw response from HuggingFace Inference API — Translation */
export interface HfTranslationResult {
  translation_text: string;
}

export type HfTranslationResponse = HfTranslationResult[];

/** Raw response from HuggingFace Inference API — Summarization */
export interface HfSummarizationResult {
  summary_text: string;
}

export type HfSummarizationResponse = HfSummarizationResult[];
