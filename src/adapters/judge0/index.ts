import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  Judge0Submission,
  Judge0Language,
  CodeExecuteOutput,
  CodeLanguagesOutput,
} from './types';

/**
 * Judge0 CE adapter (UC-238).
 *
 * Supported tools:
 *   code.execute   → POST /submissions?base64_encoded=false&wait=true
 *   code.languages → GET /languages
 *
 * Auth: None (free public instance).
 * 71 languages. Sandboxed execution.
 */
export class Judge0Adapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'judge0',
      baseUrl: 'https://ce.judge0.com',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'code.execute': {
        const bodyObj: Record<string, unknown> = {
          language_id: Number(params.language_id),
          source_code: String(params.source_code ?? ''),
        };
        if (params.stdin) bodyObj.stdin = String(params.stdin);
        if (params.cpu_time_limit) bodyObj.cpu_time_limit = Number(params.cpu_time_limit);
        if (params.memory_limit) bodyObj.memory_limit = Number(params.memory_limit);
        return {
          url: `${this.baseUrl}/submissions?base64_encoded=false&wait=true`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyObj),
        };
      }

      case 'code.languages':
        return {
          url: `${this.baseUrl}/languages`,
          method: 'GET',
          headers: {},
        };

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
      case 'code.execute':
        return this.parseExecution(raw.body as unknown as Judge0Submission);
      case 'code.languages':
        return this.parseLanguages(raw.body as unknown as Judge0Language[]);
      default:
        return raw.body;
    }
  }

  private parseExecution(body: Judge0Submission): CodeExecuteOutput {
    const statusDesc = body.status?.description ?? 'Unknown';
    const isAccepted = body.status?.id === 3; // 3 = Accepted
    return {
      status: statusDesc,
      stdout: (body.stdout ?? '').trim(),
      stderr: (body.stderr ?? '').trim(),
      compile_output: (body.compile_output ?? '').trim(),
      execution_time_sec: body.time ? parseFloat(body.time) : null,
      memory_kb: body.memory,
      success: isAccepted,
    };
  }

  private parseLanguages(body: Judge0Language[]): CodeLanguagesOutput {
    const langs = Array.isArray(body) ? body : [];
    return {
      languages: langs.map((l) => ({ id: l.id, name: l.name })),
      total: langs.length,
    };
  }
}
