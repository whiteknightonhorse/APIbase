import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  OrphadataRawDisease,
  OrphadataRawEpidemiology,
  OrphadataRawPhenotypes,
  OrphadataRawNaturalHistory,
  OrphadataCrossRef,
  OrphadataDiseaseLookupOutput,
  OrphadataDiseaseEpidemiologyOutput,
  OrphadataDiseasePhenotypesOutput,
  OrphadataDiseaseNaturalHistoryOutput,
} from './types';

const ORPHADATA_BASE = 'https://api.orphadata.com';

export class OrphadataAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'orphadata', baseUrl: ORPHADATA_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const lang = params.lang ? String(params.lang).toLowerCase() : 'en';

    switch (req.toolId) {
      case 'orphadata.disease_lookup': {
        const name = encodeURIComponent(String(params.name));
        return {
          url: `${ORPHADATA_BASE}/rd-cross-referencing/orphacodes/names/${name}?lang=${lang}`,
          method: 'GET',
          headers,
        };
      }

      case 'orphadata.disease_epidemiology': {
        const code = Number(params.orphacode);
        return {
          url: `${ORPHADATA_BASE}/rd-epidemiology/orphacodes/${code}?lang=${lang}`,
          method: 'GET',
          headers,
        };
      }

      case 'orphadata.disease_phenotypes': {
        const code = Number(params.orphacode);
        return {
          url: `${ORPHADATA_BASE}/rd-phenotypes/orphacodes/${code}?lang=${lang}`,
          method: 'GET',
          headers,
        };
      }

      case 'orphadata.disease_natural_history': {
        const code = Number(params.orphacode);
        return {
          url: `${ORPHADATA_BASE}/rd-natural_history/orphacodes/${code}?lang=${lang}`,
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
    const body = raw.body as Record<string, unknown>;

    if (body.error) {
      const err = body.error as Record<string, unknown>;
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: String(err.message ?? 'Rare disease not found'),
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    const data = body.data as Record<string, unknown>;
    const count = Number(data?.__count ?? 0);

    if (count === 0) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: 'No matching rare disease found',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    const results = data?.results as Record<string, unknown>;

    switch (req.toolId) {
      case 'orphadata.disease_lookup':
        return this.parseDiseaseLookup(results as unknown as OrphadataRawDisease);
      case 'orphadata.disease_epidemiology':
        return this.parseDiseaseEpidemiology(results as unknown as OrphadataRawEpidemiology);
      case 'orphadata.disease_phenotypes':
        return this.parseDiseasePhenotypes(results as unknown as OrphadataRawPhenotypes);
      case 'orphadata.disease_natural_history':
        return this.parseDiseaseNaturalHistory(results as unknown as OrphadataRawNaturalHistory);
      default:
        return body;
    }
  }

  private parseDiseaseLookup(r: OrphadataRawDisease): OrphadataDiseaseLookupOutput {
    const definition =
      r.SummaryInformation && r.SummaryInformation.length > 0
        ? (r.SummaryInformation[0].Definition ?? '')
        : '';

    const crossRefs: OrphadataCrossRef[] = (r.ExternalReference ?? []).map((ref) => ({
      source: ref.Source,
      reference: ref.Reference,
      mapping_relation: ref.DisorderMappingRelation,
      validated: ref.DisorderMappingValidationStatus === 'Validated',
      icd_relation: ref.DisorderMappingICDRelation ?? undefined,
    }));

    const synonyms = (r.Synonym ?? []).filter((s) => typeof s === 'string') as string[];

    return {
      orphacode: r.ORPHAcode,
      name: r['Preferred term'],
      definition,
      disorder_group: r.DisorderGroup,
      typology: r.Typology,
      synonyms,
      cross_references: crossRefs,
      orphanet_url: r.OrphanetURL,
      last_updated: r.Date ?? '',
    };
  }

  private parseDiseaseEpidemiology(
    r: OrphadataRawEpidemiology,
  ): OrphadataDiseaseEpidemiologyOutput {
    const prevalenceRecords = (r.Prevalence ?? []).map((p) => ({
      type: p.PrevalenceType,
      prevalence_class: p.PrevalenceClass,
      geographic_area: p.PrevalenceGeographic,
      qualification: p.PrevalenceQualification,
      mean_value: p.ValMoy ? parseFloat(p.ValMoy) || null : null,
      validation_status: p.PrevalenceValidationStatus,
      sources: p.Source ? p.Source.split('_') : [],
    }));

    return {
      orphacode: r.ORPHAcode,
      name: r['Preferred term'],
      prevalence_records: prevalenceRecords,
      orphanet_url: r.OrphanetURL,
    };
  }

  private parseDiseasePhenotypes(r: OrphadataRawPhenotypes): OrphadataDiseasePhenotypesOutput {
    const disorder = r.Disorder ?? {};
    const hpoAssoc = disorder.HPODisorderAssociation ?? [];

    const hpoTerms = hpoAssoc.map((h) => ({
      hpo_id: h.HPO?.HPOId ?? '',
      hpo_term: h.HPO?.HPOTerm ?? '',
      frequency: h.HPOFrequency ?? '',
      is_diagnostic_criterion: h.DiagnosticCriteria === 'Diagnostic criterion',
    }));

    const pmids = r.Source
      ? r.Source.split('_')
          .filter((s) => s.includes('[PMID]'))
          .map((s) => s.replace('[PMID]', ''))
      : [];

    return {
      orphacode: disorder.ORPHAcode ?? 0,
      name: disorder['Preferred term'] ?? '',
      hpo_terms: hpoTerms,
      validation_status: r.ValidationStatus ?? '',
      validated_date: r.ValidationDate ?? '',
      source_pmids: pmids,
    };
  }

  private parseDiseaseNaturalHistory(
    r: OrphadataRawNaturalHistory,
  ): OrphadataDiseaseNaturalHistoryOutput {
    return {
      orphacode: r.ORPHAcode,
      name: r['Preferred term'],
      inheritance_modes: r.TypeOfInheritance ?? [],
      age_of_onset: r.AverageAgeOfOnset ?? [],
      disorder_group: r.DisorderGroup,
      typology: r.Typology,
      orphanet_url: r.OrphanetURL,
    };
  }
}
