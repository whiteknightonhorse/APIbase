import { BaseAdapter } from '../base.adapter';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

export class AssemblyAIAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ timeout: 30_000, maxRetries: 1, maxResponseSize: 1_048_576 });
    this.apiKey = apiKey;
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const base = 'https://api.assemblyai.com/v2';
    const headers = {
      'Authorization': this.apiKey,
      'Content-Type': 'application/json',
    };

    switch (req.toolId) {
      case 'transcribe.submit': {
        const payload: Record<string, unknown> = {
          audio_url: params.audio_url,
          speech_models: [String(params.model ?? 'universal-2')],
        };
        if (params.language_code) payload.language_code = params.language_code;
        if (params.speaker_labels) payload.speaker_labels = true;
        return { url: `${base}/transcript`, method: 'POST', headers, body: JSON.stringify(payload) };
      }

      case 'transcribe.status': {
        const id = String(params.transcript_id ?? '');
        return { url: `${base}/transcript/${id}`, method: 'GET', headers: { 'Authorization': this.apiKey } };
      }

      case 'transcribe.result': {
        const id = String(params.transcript_id ?? '');
        return { url: `${base}/transcript/${id}`, method: 'GET', headers: { 'Authorization': this.apiKey } };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body =
      typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;

    if (body?.error) {
      return { ...raw, status: 502, body: { error: body.error } };
    }

    if (req.toolId === 'transcribe.submit') {
      return {
        ...raw,
        body: {
          transcript_id: body.id,
          status: body.status,
          audio_url: body.audio_url,
          message: 'Transcription queued. Use transcribe.status or transcribe.result with this transcript_id to check progress.',
        },
      };
    }

    if (req.toolId === 'transcribe.status') {
      return {
        ...raw,
        body: {
          transcript_id: body.id,
          status: body.status,
          audio_duration_seconds: body.audio_duration,
          message: body.status === 'completed'
            ? 'Transcription complete. Use transcribe.result to get the text.'
            : body.status === 'error'
              ? `Transcription failed: ${body.error}`
              : 'Still processing. Check again in a few seconds.',
        },
      };
    }

    if (req.toolId === 'transcribe.result') {
      if (body.status !== 'completed') {
        return {
          ...raw,
          body: {
            transcript_id: body.id,
            status: body.status,
            message: body.status === 'error'
              ? `Transcription failed: ${body.error}`
              : 'Not ready yet. Check status first.',
          },
        };
      }

      const result: Record<string, unknown> = {
        transcript_id: body.id,
        status: 'completed',
        text: body.text,
        audio_duration_seconds: body.audio_duration,
        confidence: body.confidence,
        language_code: body.language_code,
        word_count: body.words?.length ?? 0,
      };

      if (body.utterances) {
        result.speakers = (body.utterances as Array<Record<string, unknown>>).map(u => ({
          speaker: u.speaker,
          text: u.text,
          start: u.start,
          end: u.end,
          confidence: u.confidence,
        }));
      }

      return { ...raw, body: result };
    }

    return raw;
  }
}
