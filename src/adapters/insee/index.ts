import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  InseeSirenResponse,
  InseeSiretResponse,
  InseeSirenSearchResponse,
  InseeSiretSearchResponse,
  InseeUniteLegale,
  InseeEtablissement,
  InseePeriodeUniteLegale,
  InseePeriodeEtablissement,
  InseeCompanyOutput,
  InseeEstablishmentOutput,
} from './types';

const INSEE_BASE = 'https://api.insee.fr/api-sirene/3.11';

/**
 * INSEE Sirene API adapter (UC-495).
 *
 * French national company and establishment registry (SIREN/SIRET).
 * ~30M legal units and ~40M establishments. Updated daily.
 * Auth: X-INSEE-Api-Key-Integration header.
 * Rate limit: 30 req/min, 500K req/month (free plan).
 */
export class InseeAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'insee', baseUrl: INSEE_BASE });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'X-INSEE-Api-Key-Integration': this.apiKey,
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'insee.company_by_siren': {
        const siren = String(params.siren).replace(/\s/g, '');
        return {
          url: `${INSEE_BASE}/siren/${encodeURIComponent(siren)}`,
          method: 'GET',
          headers,
        };
      }

      case 'insee.establishment_by_siret': {
        const siret = String(params.siret).replace(/\s/g, '');
        return {
          url: `${INSEE_BASE}/siret/${encodeURIComponent(siret)}`,
          method: 'GET',
          headers,
        };
      }

      case 'insee.search_companies': {
        const qp = new URLSearchParams();
        qp.set('q', String(params.q));
        const max = Math.min(Math.max(1, Number(params.max) || 10), 20);
        qp.set('nombre', String(max));
        if (params.offset) qp.set('debut', String(Math.max(0, Number(params.offset))));
        return { url: `${INSEE_BASE}/siren?${qp.toString()}`, method: 'GET', headers };
      }

      case 'insee.search_establishments': {
        const qp = new URLSearchParams();
        qp.set('q', String(params.q));
        const max = Math.min(Math.max(1, Number(params.max) || 10), 20);
        qp.set('nombre', String(max));
        if (params.offset) qp.set('debut', String(Math.max(0, Number(params.offset))));
        return { url: `${INSEE_BASE}/siret?${qp.toString()}`, method: 'GET', headers };
      }

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
          retryable: false,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'insee.company_by_siren':
        return this.parseCompany((body as unknown as InseeSirenResponse).uniteLegale);

      case 'insee.establishment_by_siret':
        return this.parseEstablishment((body as unknown as InseeSiretResponse).etablissement);

      case 'insee.search_companies': {
        const d = body as unknown as InseeSirenSearchResponse;
        return {
          total: d.header?.total ?? null,
          offset: d.header?.debut ?? 0,
          count: (d.unitesLegales ?? []).length,
          results: (d.unitesLegales ?? []).map((u) => this.parseCompany(u)),
        };
      }

      case 'insee.search_establishments': {
        const d = body as unknown as InseeSiretSearchResponse;
        return {
          total: d.header?.total ?? null,
          offset: d.header?.debut ?? 0,
          count: (d.etablissements ?? []).length,
          results: (d.etablissements ?? []).map((e) => this.parseEstablishment(e)),
        };
      }

      default:
        return body;
    }
  }

  private currentPeriod<T extends InseePeriodeUniteLegale | InseePeriodeEtablissement>(
    periods: T[] | undefined,
  ): T | undefined {
    if (!periods || periods.length === 0) return undefined;
    return periods.find((p) => p.dateFin === null) ?? periods[0];
  }

  private parseCompany(u: InseeUniteLegale): InseeCompanyOutput {
    const period = this.currentPeriod(u.periodesUniteLegale);
    return {
      siren: u.siren,
      name: period?.denominationUniteLegale ?? u.denominationUniteLegale ?? null,
      acronym: u.sigleUniteLegale ?? null,
      status:
        period?.etatAdministratifUniteLegale === 'A'
          ? 'active'
          : period?.etatAdministratifUniteLegale === 'C'
            ? 'ceased'
            : (period?.etatAdministratifUniteLegale ?? u.etatAdministratifUniteLegale ?? null),
      naf_code: period?.activitePrincipaleUniteLegale ?? u.activitePrincipaleUniteLegale ?? null,
      legal_category:
        period?.categorieJuridiqueUniteLegale ?? u.categorieJuridiqueUniteLegale ?? null,
      creation_date: u.dateCreationUniteLegale ?? null,
      company_size: u.categorieEntreprise ?? null,
      last_updated: u.dateDernierTraitementUniteLegale ?? null,
      head_office_nic: period?.nicSiegeUniteLegale ?? u.nicSiegeUniteLegale ?? null,
    };
  }

  private parseEstablishment(e: InseeEtablissement): InseeEstablishmentOutput {
    const period = this.currentPeriod(e.periodesEtablissement);
    const addr = e.adresseEtablissement;

    const streetParts = [
      addr?.numeroVoieEtablissement,
      addr?.typeVoieEtablissement,
      addr?.libelleVoieEtablissement,
    ].filter(Boolean);

    return {
      siret: e.siret,
      siren: e.siren,
      nic: e.nic,
      is_head_office: e.etablissementSiege ?? false,
      status:
        period?.etatAdministratifEtablissement === 'A'
          ? 'active'
          : period?.etatAdministratifEtablissement === 'F'
            ? 'closed'
            : (period?.etatAdministratifEtablissement ?? null),
      naf_code: period?.activitePrincipaleEtablissement ?? null,
      creation_date: e.dateCreationEtablissement ?? null,
      address: {
        street: streetParts.length > 0 ? streetParts.join(' ') : null,
        postal_code: addr?.codePostalEtablissement ?? null,
        city: addr?.libelleCommuneEtablissement ?? null,
        country: addr?.libellePaysEtrangerEtablissement ?? 'France',
      },
      company: e.uniteLegale ? this.parseCompany(e.uniteLegale) : null,
    };
  }
}
