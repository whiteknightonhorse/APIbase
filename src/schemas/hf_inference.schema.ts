import { z } from 'zod';

const textInput = z
  .string()
  .min(1)
  .describe('Input text to process. Maximum ~10,000 characters depending on model context window.');

export const hfInferenceSchemas: Record<string, z.ZodTypeAny> = {
  'hf_inference.sentiment': z
    .object({
      text: textInput,
      model: z
        .string()
        .optional()
        .describe(
          'HuggingFace model ID to use for sentiment classification. ' +
            'Default: "cardiffnlp/twitter-roberta-base-sentiment-latest" (3-class: positive/neutral/negative). ' +
            'Alternatives: "distilbert-base-uncased-finetuned-sst-2-english" (2-class: POSITIVE/NEGATIVE), ' +
            '"nlptown/bert-base-multilingual-uncased-sentiment" (1-5 star, multilingual).',
        ),
    })
    .strip()
    .describe(
      'Classify the sentiment of a text using a HuggingFace NLP model. ' +
        'Returns a predicted label (positive, negative, or neutral) with a confidence score, ' +
        'plus scores for all classes. Default model is optimized for social media and short-form text. ' +
        'Useful for customer feedback analysis, social media monitoring, and review classification.',
    ),

  'hf_inference.ner': z
    .object({
      text: textInput,
      model: z
        .string()
        .optional()
        .describe(
          'HuggingFace model ID to use for named entity recognition. ' +
            'Default: "dbmdz/bert-large-cased-finetuned-conll03-english" (English NER: PER, LOC, ORG, MISC). ' +
            'Alternatives: "dslim/bert-base-NER" (lightweight English NER), ' +
            '"Jean-Baptiste/roberta-large-ner-english" (higher accuracy English NER).',
        ),
    })
    .strip()
    .describe(
      'Extract named entities (people, locations, organizations, and miscellaneous) from text ' +
        'using a BERT-based NER model. Returns each detected entity with its type, confidence score, ' +
        'and character positions in the original text. ' +
        'Useful for document parsing, contact extraction, and knowledge graph construction.',
    ),

  'hf_inference.zero_shot': z
    .object({
      text: textInput,
      candidate_labels: z
        .array(z.string().min(1))
        .min(2)
        .max(20)
        .describe(
          'List of candidate category labels to classify the text into (2–20 labels). ' +
            'Example: ["politics", "sports", "technology", "entertainment"]. ' +
            'Labels can be any descriptive phrases — the model performs inference without prior training on these labels.',
        ),
      multi_label: z
        .boolean()
        .optional()
        .describe(
          'If true, scores are independent for each label (text can match multiple categories simultaneously). ' +
            'If false (default), scores are mutually exclusive and sum to 1 (single best category).',
        ),
      model: z
        .string()
        .optional()
        .describe(
          'HuggingFace model ID to use for zero-shot classification. ' +
            'Default: "facebook/bart-large-mnli" (MNLI-trained, accurate but slower). ' +
            'Alternatives: "cross-encoder/nli-deberta-v3-small" (lighter and faster).',
        ),
    })
    .strip()
    .describe(
      'Classify text into any custom set of categories without requiring model fine-tuning. ' +
        'Provide a list of candidate labels and the model determines which best describes the input text. ' +
        'Returns labels ranked by confidence score. ' +
        'Ideal for routing, content moderation, intent detection, and ad-hoc categorization.',
    ),

  'hf_inference.translate': z
    .object({
      text: textInput,
      target_lang: z
        .string()
        .length(2)
        .describe(
          'ISO 639-1 two-letter target language code (e.g. "fr" for French, "es" for Spanish, ' +
            '"de" for German, "pt" for Portuguese, "it" for Italian, "nl" for Dutch, ' +
            '"ru" for Russian, "zh" for Chinese, "ja" for Japanese, "ar" for Arabic, ' +
            '"ko" for Korean, "hi" for Hindi). ' +
            'Must have an available Helsinki-NLP/opus-mt model for the source→target pair.',
        ),
      source_lang: z
        .string()
        .length(2)
        .optional()
        .describe(
          'ISO 639-1 two-letter source language code. Default: "en" (English). ' +
            'Change if the input text is in a language other than English ' +
            '(e.g. "fr" for French input, "es" for Spanish input). ' +
            'A Helsinki-NLP/opus-mt model must exist for the source→target language pair.',
        ),
      model: z
        .string()
        .optional()
        .describe(
          'Override the HuggingFace model ID for translation. ' +
            'If omitted, the adapter automatically selects ' +
            '"Helsinki-NLP/opus-mt-{source_lang}-{target_lang}" (e.g. "Helsinki-NLP/opus-mt-en-fr"). ' +
            'Use this to specify a different translation model, such as "facebook/nllb-200-distilled-600M" ' +
            'for broader multilingual coverage.',
        ),
    })
    .strip()
    .describe(
      'Translate text between languages using the Helsinki-NLP opus-mt model family. ' +
        'Covers 1,000+ language pairs. By default translates from English to the target language. ' +
        'Specify source_lang to translate from other languages. ' +
        'Useful for multilingual content pipelines, localization, and cross-language analysis.',
    ),

  'hf_inference.summarize': z
    .object({
      text: textInput,
      max_length: z
        .number()
        .int()
        .min(20)
        .max(1024)
        .optional()
        .describe(
          'Maximum number of tokens in the generated summary (20–1024). ' +
            'Default: model-controlled (typically ~150 tokens for BART-large-CNN). ' +
            'Set lower for shorter summaries (e.g. 60 for a single-sentence abstract).',
        ),
      min_length: z
        .number()
        .int()
        .min(10)
        .max(512)
        .optional()
        .describe(
          'Minimum number of tokens in the generated summary (10–512). ' +
            'Prevents very short or empty summaries. ' +
            'Default: model-controlled (typically ~30 tokens). ' +
            'Set min_length lower than max_length.',
        ),
      model: z
        .string()
        .optional()
        .describe(
          'HuggingFace model ID to use for summarization. ' +
            'Default: "facebook/bart-large-cnn" (trained on CNN/DailyMail, excellent for news and articles). ' +
            'Alternatives: "sshleifer/distilbart-cnn-12-6" (faster, lighter), ' +
            '"google/pegasus-xsum" (extreme summarization, single sentence).',
        ),
    })
    .strip()
    .describe(
      'Summarize a long text into a shorter, coherent paragraph using a sequence-to-sequence NLP model. ' +
        'The default BART model is trained on news articles (CNN/DailyMail) and works well for factual prose. ' +
        'Control output length with max_length and min_length parameters. ' +
        'Useful for article digests, executive summaries, and reducing LLM context window usage.',
    ),
};
