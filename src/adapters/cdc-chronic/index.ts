import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CdcCdiRecord, CdcTopicRecord, CdcStateRecord, CdcTrendRecord } from './types';

/**
 * CDC Chronic Disease Indicators (CDI) Socrata adapter (UC-565).
 *
 * Supported tools (read-only):
 *   cdc_chronic.indicators   → GET /resource/hksd-2xuw.json  (query indicator data)
 *   cdc_chronic.topics       → GET /resource/hksd-2xuw.json  (list topics and questions)
 *   cdc_chronic.state_compare → GET /resource/hksd-2xuw.json  (compare across states)
 *   cdc_chronic.trend        → GET /resource/hksd-2xuw.json  (trend over years)
 *
 * Auth: None (US Government open data, Socrata SoQL API, public domain).
 * Dataset: hksd-2xuw — 398K records, 19 topics, 50 states + DC + US national.
 */
export class CdcChronicAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'cdc-chronic',
      baseUrl: 'https://chronicdata.cdc.gov',
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
      case 'cdc_chronic.indicators':
        return this.buildIndicatorsRequest(params, headers);
      case 'cdc_chronic.topics':
        return this.buildTopicsRequest(params, headers);
      case 'cdc_chronic.state_compare':
        return this.buildStateCompareRequest(params, headers);
      case 'cdc_chronic.trend':
        return this.buildTrendRequest(params, headers);
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
    const body = raw.body as unknown[];

    switch (req.toolId) {
      case 'cdc_chronic.indicators':
        return this.parseIndicators(body as CdcCdiRecord[]);
      case 'cdc_chronic.topics':
        return this.parseTopics(body as CdcTopicRecord[]);
      case 'cdc_chronic.state_compare':
        return this.parseStateCompare(
          body as CdcStateRecord[],
          req.params as Record<string, unknown>,
        );
      case 'cdc_chronic.trend':
        return this.parseTrend(body as CdcTrendRecord[], req.params as Record<string, unknown>);
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildIndicatorsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    const conditions: string[] = [];

    if (params.topic_id) conditions.push(`topicid='${String(params.topic_id).toUpperCase()}'`);
    if (params.question_id)
      conditions.push(`questionid='${String(params.question_id).toUpperCase()}'`);
    if (params.location) {
      conditions.push(`locationabbr='${String(params.location).toUpperCase()}'`);
    }
    if (params.year_start) conditions.push(`yearstart>='${String(params.year_start)}'`);
    if (params.year_end) conditions.push(`yearstart<='${String(params.year_end)}'`);
    if (params.stratification_id) {
      conditions.push(`stratificationid1='${String(params.stratification_id).toUpperCase()}'`);
    }

    if (conditions.length > 0) qs.set('$where', conditions.join(' AND '));
    qs.set('$order', 'yearstart DESC, locationabbr');
    qs.set('$limit', String(params.limit ?? 25));

    return {
      url: `${this.baseUrl}/resource/hksd-2xuw.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildTopicsRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    const conditions: string[] = [];

    if (params.topic_id) conditions.push(`topicid='${String(params.topic_id).toUpperCase()}'`);

    if (conditions.length > 0) qs.set('$where', conditions.join(' AND '));
    qs.set('$select', 'topicid,topic,questionid,question');
    qs.set('$group', 'topicid,topic,questionid,question');
    qs.set('$order', 'topicid,questionid');
    qs.set('$limit', '200');

    return {
      url: `${this.baseUrl}/resource/hksd-2xuw.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildStateCompareRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    const conditions: string[] = [];

    const questionId = params.question_id ? String(params.question_id).toUpperCase() : 'DIA01';
    conditions.push(`questionid='${questionId}'`);

    const stratId = params.stratification_id
      ? String(params.stratification_id).toUpperCase()
      : 'OVR';
    conditions.push(`stratificationid1='${stratId}'`);

    if (params.year) {
      conditions.push(`yearstart='${String(params.year)}'`);
    } else {
      conditions.push(`yearstart>='2020'`);
    }

    qs.set('$where', conditions.join(' AND '));
    qs.set(
      '$select',
      'locationabbr,locationdesc,yearstart,datavalue,datavalueunit,datavaluetype,lowconfidencelimit,highconfidencelimit',
    );
    qs.set('$order', 'yearstart DESC, locationabbr');
    qs.set('$limit', '60');

    return {
      url: `${this.baseUrl}/resource/hksd-2xuw.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildTrendRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    const conditions: string[] = [];

    const questionId = params.question_id ? String(params.question_id).toUpperCase() : 'TOB04';
    conditions.push(`questionid='${questionId}'`);

    const location = params.location ? String(params.location).toUpperCase() : 'US';
    conditions.push(`locationabbr='${location}'`);

    if (params.stratification_id) {
      conditions.push(`stratificationid1='${String(params.stratification_id).toUpperCase()}'`);
    }
    if (params.value_type_id) {
      conditions.push(`datavaluetypeid='${String(params.value_type_id).toUpperCase()}'`);
    }

    qs.set('$where', conditions.join(' AND '));
    qs.set(
      '$select',
      'yearstart,yearend,datavalue,datavalueunit,datavaluetype,lowconfidencelimit,highconfidencelimit,stratification1',
    );
    qs.set('$order', 'yearstart DESC');
    qs.set('$limit', String(params.limit ?? 20));

    return {
      url: `${this.baseUrl}/resource/hksd-2xuw.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private parseIndicators(records: CdcCdiRecord[]): unknown {
    return {
      count: records.length,
      indicators: records.map((r) => ({
        year: r.yearstart,
        location: r.locationabbr,
        location_name: r.locationdesc,
        topic: r.topic,
        topic_id: r.topicid ?? null,
        question: r.question,
        question_id: r.questionid ?? null,
        value: r.datavalue !== undefined ? Number(r.datavalue) : null,
        unit: r.datavalueunit ?? null,
        value_type: r.datavaluetype ?? null,
        ci_low: r.lowconfidencelimit !== undefined ? Number(r.lowconfidencelimit) : null,
        ci_high: r.highconfidencelimit !== undefined ? Number(r.highconfidencelimit) : null,
        stratification: r.stratification1 ?? null,
        stratification_category: r.stratificationcategory1 ?? null,
        data_source: r.datasource ?? null,
      })),
    };
  }

  private parseTopics(records: CdcTopicRecord[]): unknown {
    const topicMap = new Map<
      string,
      { id: string; name: string; questions: { id: string; text: string }[] }
    >();

    for (const r of records) {
      if (!topicMap.has(r.topicid)) {
        topicMap.set(r.topicid, { id: r.topicid, name: r.topic, questions: [] });
      }
      const entry = topicMap.get(r.topicid);
      if (entry) entry.questions.push({ id: r.questionid, text: r.question });
    }

    const topics = Array.from(topicMap.values()).sort((a, b) => a.id.localeCompare(b.id));

    return {
      topic_count: topics.length,
      topics,
    };
  }

  private parseStateCompare(records: CdcStateRecord[], params: Record<string, unknown>): unknown {
    const seen = new Set<string>();
    const states: {
      location: string;
      location_name: string;
      year: string;
      value: number | null;
      unit: string | null;
      value_type: string | null;
      ci_low: number | null;
      ci_high: number | null;
    }[] = [];

    for (const r of records as (CdcStateRecord & { yearstart?: string })[]) {
      const key = `${r.locationabbr}`;
      if (seen.has(key)) continue;
      seen.add(key);

      states.push({
        location: r.locationabbr,
        location_name: r.locationdesc,
        year: (r as unknown as Record<string, string>).yearstart ?? '',
        value: r.datavalue !== undefined ? Number(r.datavalue) : null,
        unit: r.datavalueunit ?? null,
        value_type: r.datavaluetype ?? null,
        ci_low: r.lowconfidencelimit !== undefined ? Number(r.lowconfidencelimit) : null,
        ci_high: r.highconfidencelimit !== undefined ? Number(r.highconfidencelimit) : null,
      });
    }

    const withValues = states.filter((s) => s.value !== null);
    const sorted = [...withValues].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    return {
      question_id: params.question_id ?? 'DIA01',
      stratification: params.stratification_id ?? 'OVR',
      state_count: states.length,
      highest: sorted
        .slice(0, 5)
        .map((s) => ({ location: s.location, value: s.value, unit: s.unit })),
      lowest: sorted
        .slice(-5)
        .reverse()
        .map((s) => ({ location: s.location, value: s.value, unit: s.unit })),
      all_states: states,
    };
  }

  private parseTrend(records: CdcTrendRecord[], params: Record<string, unknown>): unknown {
    return {
      question_id: params.question_id ?? 'TOB04',
      location: params.location ?? 'US',
      count: records.length,
      trend: records.map((r) => ({
        year: r.yearstart,
        value: r.datavalue !== undefined ? Number(r.datavalue) : null,
        unit: r.datavalueunit ?? null,
        value_type: r.datavaluetype ?? null,
        ci_low: r.lowconfidencelimit !== undefined ? Number(r.lowconfidencelimit) : null,
        ci_high: r.highconfidencelimit !== undefined ? Number(r.highconfidencelimit) : null,
        stratification: r.stratification1 ?? null,
      })),
    };
  }
}
