import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { DuckDuckGoInstantAnswerResponse, DuckDuckGoRelatedTopic } from './types';

/**
 * DuckDuckGo Instant Answer adapter (UC-637).
 *
 * Supported tools (read-only):
 *   duckduckgo.instant_answer  → GET /  (Abstract/Answer/Definition/Infobox digest for a query)
 *   duckduckgo.related_topics  → GET /  (RelatedTopics/disambiguation list for a query)
 *
 * Both tools call the same single upstream endpoint (api.duckduckgo.com) with different
 * response projections — the upstream has no separate endpoints per field.
 *
 * Auth: none. Free tier: unlimited, no documented rate limit. Upstream always responds
 * HTTP 202 Accepted (not 200) with a JSON body — this is normal, not an error.
 */
export class DuckDuckGoAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'duckduckgo',
      baseUrl: 'https://api.duckduckgo.com',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'duckduckgo.instant_answer':
      case 'duckduckgo.related_topics': {
        const query = String(params.query);
        const qs = new URLSearchParams({
          q: query,
          format: 'json',
          no_html: '1',
          skip_disambig: '1',
        });
        return {
          url: `${this.baseUrl}/?${qs.toString()}`,
          method: 'GET',
          headers,
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
    const body = raw.body as DuckDuckGoInstantAnswerResponse;

    switch (req.toolId) {
      case 'duckduckgo.instant_answer': {
        if (typeof body.Heading !== 'string') {
          throw new Error('Missing Heading in instant answer response');
        }
        return {
          heading: body.Heading,
          type: body.Type,
          abstract_text: body.AbstractText,
          abstract_source: body.AbstractSource,
          abstract_url: body.AbstractURL,
          answer: body.Answer,
          answer_type: body.AnswerType,
          definition: body.Definition,
          definition_source: body.DefinitionSource,
          definition_url: body.DefinitionURL,
          entity: body.Entity,
          image: body.Image,
          infobox: Array.isArray(body.Infobox) ? null : (body.Infobox ?? null),
        };
      }
      case 'duckduckgo.related_topics': {
        if (!Array.isArray(body.RelatedTopics)) {
          throw new Error('Expected RelatedTopics array in response');
        }
        return {
          heading: body.Heading,
          related_topics: flattenRelatedTopics(body.RelatedTopics),
        };
      }
      default:
        return body;
    }
  }
}

/**
 * DuckDuckGo groups disambiguation results into named categories (each a
 * {Name, Topics: [...]} node instead of a flat {Text, FirstURL} entry). Flatten
 * both shapes into a single list so agents don't need to branch on structure.
 */
function flattenRelatedTopics(
  topics: DuckDuckGoRelatedTopic[],
  category?: string,
): Array<{ text: string; first_url: string; category: string | null }> {
  const flat: Array<{ text: string; first_url: string; category: string | null }> = [];
  for (const topic of topics) {
    if (Array.isArray(topic.Topics)) {
      flat.push(...flattenRelatedTopics(topic.Topics, topic.Name ?? category));
    } else if (topic.Text && topic.FirstURL) {
      flat.push({ text: topic.Text, first_url: topic.FirstURL, category: category ?? null });
    }
  }
  return flat;
}
