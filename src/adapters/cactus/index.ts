import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse } from '../../types/provider';
import { logger } from '../../config/logger';
import type { CactusResolveResult, CactusFormulaResult, CactusNamesResult } from './types';

/**
 * NCI CACTUS Chemical Identifier Resolver adapter (UC-220).
 *
 * Supported tools:
 *   chem.resolve  → GET /chemical/structure/{identifier}/{representation}
 *   chem.formula  → GET /chemical/structure/{identifier}/formula + /mw
 *   chem.names    → GET /chemical/structure/{identifier}/names
 *
 * Auth: None (US gov open data, unlimited).
 *
 * IMPORTANT: API returns plain text, not JSON.
 * This adapter overrides call() to handle text responses directly.
 */
export class CactusAdapter extends BaseAdapter {
  private static readonly BASE = 'https://cactus.nci.nih.gov/chemical/structure';

  constructor() {
    super({ provider: 'cactus', baseUrl: CactusAdapter.BASE });
  }

  protected buildRequest(): { url: string; method: string; headers: Record<string, string> } {
    // Not used — call() is overridden
    return { url: '', method: 'GET', headers: {} };
  }

  protected parseResponse(raw: ProviderRawResponse): unknown {
    return raw.body;
  }

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = req.params as Record<string, unknown>;
    let data: unknown;

    switch (req.toolId) {
      case 'chem.resolve':
        data = await this.resolve(params);
        break;
      case 'chem.formula':
        data = await this.getFormula(params);
        break;
      case 'chem.names':
        data = await this.getNames(params);
        break;
      default:
        throw {
          code: 'provider_invalid_response',
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: 'cactus',
          toolId: req.toolId,
          durationMs: 0,
        };
    }

    const durationMs = Math.round(performance.now() - start);
    logger.info({ tool_id: req.toolId, duration_ms: durationMs }, 'CACTUS query completed');

    return {
      status: 200,
      headers: {},
      body: data,
      durationMs,
      byteLength: JSON.stringify(data).length,
    };
  }

  private async fetchText(identifier: string, representation: string): Promise<string | null> {
    const encoded = encodeURIComponent(identifier);
    const url = `${CactusAdapter.BASE}/${encoded}/${representation}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'APIbase/1.0' },
      });

      if (!response.ok) return null;

      const text = await response.text();
      if (!text.trim()) return null;
      // Strip prefix labels (e.g. "InChIKey=" from stdinchikey endpoint)
      const cleaned = text.trim().replace(/^InChIKey=/, '');
      return cleaned;
    } catch {
      return null;
    }
  }

  private async resolve(params: Record<string, unknown>): Promise<CactusResolveResult> {
    const identifier = String(params.identifier ?? '');
    const output = (params.output as string) || 'all';

    if (output === 'all' || output === 'smiles') {
      const [smiles, inchi, inchikey] = await Promise.all([
        this.fetchText(identifier, 'smiles'),
        output === 'all' ? this.fetchText(identifier, 'stdinchi') : Promise.resolve(null),
        output === 'all' ? this.fetchText(identifier, 'stdinchikey') : Promise.resolve(null),
      ]);

      return {
        input: identifier,
        smiles,
        inchi,
        inchikey,
        canonical_smiles: smiles,
      };
    }

    // Specific output format requested
    const value = await this.fetchText(identifier, output);
    return {
      input: identifier,
      smiles: output === 'smiles' ? value : null,
      inchi: output === 'stdinchi' ? value : null,
      inchikey: output === 'stdinchikey' ? value : null,
      canonical_smiles: null,
    };
  }

  private async getFormula(params: Record<string, unknown>): Promise<CactusFormulaResult> {
    const identifier = String(params.identifier ?? '');

    const [formula, mwText] = await Promise.all([
      this.fetchText(identifier, 'formula'),
      this.fetchText(identifier, 'mw'),
    ]);

    return {
      input: identifier,
      formula,
      molecular_weight: mwText ? parseFloat(mwText) : null,
    };
  }

  private async getNames(params: Record<string, unknown>): Promise<CactusNamesResult> {
    const identifier = String(params.identifier ?? '');
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);

    const text = await this.fetchText(identifier, 'names');
    const allNames = text ? text.split('\n').filter((n) => n.trim()) : [];

    return {
      input: identifier,
      names: allNames.slice(0, limit),
      count: allNames.length,
    };
  }
}
