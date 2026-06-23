import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  BrregRawEntity,
  BrregRawSubUnit,
  BrregRawRoleGroup,
  BrregEntityResult,
  BrregSearchOutput,
  BrregSubUnitsOutput,
  BrregRolesOutput,
} from './types';

const BRREG_BASE = 'https://data.brreg.no/enhetsregisteret/api';

/**
 * Brreg adapter (UC-501).
 *
 * Brønnøysundregistrene — Norway's official business registry.
 * 1M+ entities, sub-units, roles. NLOD 2.0 (commercial OK). No auth, no limit documented.
 */
export class BrregAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'brreg', baseUrl: BRREG_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'brreg.search': {
        const qp = new URLSearchParams();
        if (params.name) qp.set('navn', String(params.name));
        if (params.municipality_number) qp.set('kommunenummer', String(params.municipality_number));
        if (params.org_form) qp.set('organisasjonsform', String(params.org_form));
        if (params.nace_code) qp.set('naeringskode', String(params.nace_code));
        const size = Math.min(Number(params.size) || 5, 20);
        qp.set('size', String(size));
        const page = Math.max(0, Number(params.page) || 0);
        qp.set('page', String(page));
        return { url: `${BRREG_BASE}/enheter?${qp.toString()}`, method: 'GET', headers };
      }

      case 'brreg.entity': {
        const orgNum = encodeURIComponent(String(params.org_number).replace(/\s/g, ''));
        return { url: `${BRREG_BASE}/enheter/${orgNum}`, method: 'GET', headers };
      }

      case 'brreg.sub_units': {
        const orgNum = encodeURIComponent(String(params.org_number).replace(/\s/g, ''));
        const qp = new URLSearchParams();
        qp.set('overordnetEnhet', String(params.org_number).replace(/\s/g, ''));
        const size = Math.min(Number(params.size) || 10, 50);
        qp.set('size', String(size));
        const page = Math.max(0, Number(params.page) || 0);
        qp.set('page', String(page));
        // orgNum used only for path validation pattern; query uses qp
        void orgNum;
        return {
          url: `${BRREG_BASE}/underenheter?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'brreg.roles': {
        const orgNum = encodeURIComponent(String(params.org_number).replace(/\s/g, ''));
        return { url: `${BRREG_BASE}/enheter/${orgNum}/roller`, method: 'GET', headers };
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

    switch (req.toolId) {
      case 'brreg.search':
        return this.parseSearch(body, req.params as Record<string, unknown>);
      case 'brreg.entity':
        return this.parseEntity(body as unknown as BrregRawEntity);
      case 'brreg.sub_units':
        return this.parseSubUnits(body, req.params as Record<string, unknown>);
      case 'brreg.roles':
        return this.parseRoles(body, req.params as Record<string, unknown>);
      default:
        return body;
    }
  }

  private parseSearch(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): BrregSearchOutput {
    const embedded = body._embedded as Record<string, unknown> | undefined;
    const rawList = embedded?.enheter as BrregRawEntity[] | undefined;
    const pageInfo = body.page as Record<string, unknown> | undefined;

    return {
      total: Number(pageInfo?.totalElements ?? 0),
      page: Number(params.page) || 0,
      results: (rawList ?? []).map((e) => this.normalizeEntity(e)),
    };
  }

  private parseEntity(body: BrregRawEntity): BrregEntityResult {
    return this.normalizeEntity(body);
  }

  private parseSubUnits(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): BrregSubUnitsOutput {
    const embedded = body._embedded as Record<string, unknown> | undefined;
    const rawList = embedded?.underenheter as BrregRawSubUnit[] | undefined;
    const pageInfo = body.page as Record<string, unknown> | undefined;

    return {
      parent_org_number: String(params.org_number ?? '').replace(/\s/g, ''),
      total: Number(pageInfo?.totalElements ?? 0),
      results: (rawList ?? []).map((u) => ({
        org_number: u.organisasjonsnummer,
        name: u.navn,
        org_form: u.organisasjonsform?.kode ?? '',
        registered: u.registreringsdatoEnhetsregisteret ?? null,
        nace_code: u.naeringskode1?.kode ?? null,
        nace_description: u.naeringskode1?.beskrivelse ?? null,
        municipality: u.forretningsadresse?.kommune ?? u.postadresse?.kommune ?? null,
        employees: u.antallAnsatte ?? null,
      })),
    };
  }

  private parseRoles(
    body: Record<string, unknown>,
    params: Record<string, unknown>,
  ): BrregRolesOutput {
    const groups = (body.rollegrupper ?? []) as BrregRawRoleGroup[];

    return {
      org_number: String(params.org_number ?? '').replace(/\s/g, ''),
      role_groups: groups.map((g) => ({
        group_code: g.type.kode,
        group_description: g.type.beskrivelse,
        last_changed: g.sistEndret ?? null,
        roles: g.roller.map((r) => ({
          role_type_code: r.type.kode,
          role_type_description: r.type.beskrivelse,
          person: r.person
            ? {
                birth_year: r.person.fodselsdato?.slice(0, 4) ?? null,
                first_name: r.person.navn?.fornavn ?? null,
                last_name: r.person.navn?.etternavn ?? null,
                deceased: r.person.erDoed ?? false,
              }
            : null,
          entity_org_number: r.enhet?.organisasjonsnummer ?? null,
          entity_name: r.enhet?.navn ?? null,
          active: !(r.avregistrert ?? false),
        })),
      })),
    };
  }

  private normalizeEntity(e: BrregRawEntity): BrregEntityResult {
    const postAddr = e.postadresse;
    const bizAddr = e.forretningsadresse;

    const formatAddress = (a: typeof postAddr): string | null => {
      if (!a) return null;
      const parts = [
        ...(a.adresse ?? []),
        a.postnummer && a.poststed ? `${a.postnummer} ${a.poststed}` : null,
        a.kommune ?? null,
        a.land && a.land !== 'Norge' ? a.land : null,
      ].filter(Boolean);
      return parts.join(', ') || null;
    };

    return {
      org_number: e.organisasjonsnummer,
      name: e.navn,
      org_form: e.organisasjonsform?.kode ?? '',
      org_form_description: e.organisasjonsform?.beskrivelse ?? '',
      website: e.hjemmeside ?? null,
      phone: e.telefon ?? e.mobil ?? null,
      email: e.epostadresse ?? null,
      employees: e.antallAnsatte ?? null,
      registered: e.registreringsdatoEnhetsregisteret ?? null,
      founded: e.stiftelsesdato ?? null,
      vat_registered: e.registrertIMvaregisteret ?? false,
      bankrupt: e.konkurs ?? false,
      winding_up: e.underAvvikling ?? false,
      nace_code: e.naeringskode1?.kode ?? null,
      nace_description: e.naeringskode1?.beskrivelse ?? null,
      municipality: bizAddr?.kommune ?? postAddr?.kommune ?? null,
      post_address: formatAddress(postAddr),
      business_address: formatAddress(bizAddr),
      last_annual_report: e.sisteInnsendteAarsregnskap ?? null,
      parent_org_number: e.overordnetEnhet ?? null,
    };
  }
}
