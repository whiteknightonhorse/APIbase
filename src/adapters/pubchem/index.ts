import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  PubchemPropertyResponse,
  PubchemSynonymsResponse,
  PubchemPugViewResponse,
} from './types';

/**
 * PubChem PUG REST adapter (UC-213).
 *
 * Supported tools:
 *   pubchem.compound_search    → GET /compound/name/{name}/property/.../JSON
 *   pubchem.compound_properties → GET /compound/cid/{cid}/property/.../JSON
 *   pubchem.compound_synonyms  → GET /compound/cid/{cid}/synonyms/JSON
 *   pubchem.hazard_data        → GET /pug_view/data/compound/{cid}/JSON?heading=GHS+Classification
 *   pubchem.bioassay_summary   → GET /compound/cid/{cid}/assaysummary/JSON
 *   pubchem.structure_lookup   → GET /compound/name/{name}/property/IsomericSMILES,InChI,.../JSON
 *
 * Auth: optional NCBI API key as query param (raises limit from 5 to 10 req/sec).
 * Free tier: unlimited, US government open data.
 */
export class PubchemAdapter extends BaseAdapter {
  private readonly apiKey: string;

  private static readonly PROPERTIES = [
    'MolecularFormula',
    'MolecularWeight',
    'IUPACName',
    'IsomericSMILES',
    'CanonicalSMILES',
    'InChI',
    'InChIKey',
    'XLogP',
    'HBondDonorCount',
    'HBondAcceptorCount',
    'ExactMass',
    'TPSA',
    'Complexity',
    'Charge',
    'HeavyAtomCount',
  ].join(',');

  constructor(apiKey: string) {
    super({
      provider: 'pubchem',
      baseUrl: 'https://pubchem.ncbi.nlm.nih.gov/rest',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'pubchem.compound_search':
        return this.buildCompoundSearch(params, headers);
      case 'pubchem.compound_properties':
        return this.buildCompoundProperties(params, headers);
      case 'pubchem.compound_synonyms':
        return this.buildCompoundSynonyms(params, headers);
      case 'pubchem.hazard_data':
        return this.buildHazardData(params, headers);
      case 'pubchem.bioassay_summary':
        return this.buildBioassaySummary(params, headers);
      case 'pubchem.structure_lookup':
        return this.buildStructureLookup(params, headers);
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
    const body = raw.body;

    switch (req.toolId) {
      case 'pubchem.compound_search': {
        const data = body as PubchemPropertyResponse;
        if (!data.PropertyTable?.Properties?.length) {
          throw new Error('No compounds found');
        }
        return data;
      }
      case 'pubchem.compound_properties': {
        const data = body as PubchemPropertyResponse;
        if (!data.PropertyTable?.Properties?.length) {
          throw new Error('Compound not found');
        }
        return data.PropertyTable.Properties[0];
      }
      case 'pubchem.compound_synonyms': {
        const data = body as PubchemSynonymsResponse;
        if (!data.InformationList?.Information?.length) {
          throw new Error('No synonyms found');
        }
        const info = data.InformationList.Information[0];
        return {
          cid: info.CID,
          synonyms: info.Synonym.slice(0, 50),
          total: info.Synonym.length,
        };
      }
      case 'pubchem.hazard_data': {
        const data = body as PubchemPugViewResponse;
        if (!data.Record) {
          throw new Error('No hazard data found');
        }
        return data.Record;
      }
      case 'pubchem.bioassay_summary': {
        if (
          !body ||
          (typeof body === 'object' &&
            !Array.isArray(body) &&
            Object.keys(body as object).length === 0)
        ) {
          throw new Error('No bioassay data found');
        }
        return body;
      }
      case 'pubchem.structure_lookup': {
        const data = body as PubchemPropertyResponse;
        if (!data.PropertyTable?.Properties?.length) {
          throw new Error('Compound not found');
        }
        return data.PropertyTable.Properties[0];
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private apiKeyParam(): string {
    return this.apiKey ? `&api_key=${this.apiKey}` : '';
  }

  private buildCompoundSearch(params: Record<string, unknown>, headers: Record<string, string>) {
    const name = encodeURIComponent(String(params.name || ''));
    const limit = Number(params.limit) || 5;
    return {
      url: `${this.baseUrl}/pug/compound/name/${name}/property/${PubchemAdapter.PROPERTIES}/JSON?MaxRecords=${limit}${this.apiKeyParam()}`,
      method: 'GET',
      headers,
    };
  }

  private buildCompoundProperties(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    const cid = encodeURIComponent(String(params.cid || ''));
    return {
      url: `${this.baseUrl}/pug/compound/cid/${cid}/property/${PubchemAdapter.PROPERTIES}/JSON?${this.apiKeyParam().replace('&', '')}`,
      method: 'GET',
      headers,
    };
  }

  private buildCompoundSynonyms(params: Record<string, unknown>, headers: Record<string, string>) {
    const cid = encodeURIComponent(String(params.cid || ''));
    return {
      url: `${this.baseUrl}/pug/compound/cid/${cid}/synonyms/JSON?${this.apiKeyParam().replace('&', '')}`,
      method: 'GET',
      headers,
    };
  }

  private buildHazardData(params: Record<string, unknown>, headers: Record<string, string>) {
    const cid = encodeURIComponent(String(params.cid || ''));
    return {
      url: `${this.baseUrl}/pug_view/data/compound/${cid}/JSON?heading=GHS+Classification${this.apiKeyParam()}`,
      method: 'GET',
      headers,
    };
  }

  private buildBioassaySummary(params: Record<string, unknown>, headers: Record<string, string>) {
    const cid = encodeURIComponent(String(params.cid || ''));
    return {
      url: `${this.baseUrl}/pug/compound/cid/${cid}/assaysummary/JSON?${this.apiKeyParam().replace('&', '')}`,
      method: 'GET',
      headers,
    };
  }

  private buildStructureLookup(params: Record<string, unknown>, headers: Record<string, string>) {
    const name = encodeURIComponent(String(params.name || ''));
    const structureProps =
      'IsomericSMILES,CanonicalSMILES,InChI,InChIKey,MolecularFormula,MolecularWeight';
    return {
      url: `${this.baseUrl}/pug/compound/name/${name}/property/${structureProps}/JSON?${this.apiKeyParam().replace('&', '')}`,
      method: 'GET',
      headers,
    };
  }
}
