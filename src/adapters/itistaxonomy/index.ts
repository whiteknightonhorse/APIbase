import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  ItisSearchByScientificNameResponse,
  ItisSearchByCommonNameResponse,
  ItisFullRecordResponse,
} from './types';

function trim(v: string | null | undefined): string | null {
  return v == null ? null : v.trim() || null;
}

function combinedScientificName(sn: {
  unitName1: string | null;
  unitName2: string | null;
  unitName3: string | null;
  unitName4: string | null;
  combinedName?: string | null;
}): string | null {
  if (sn.combinedName) return trim(sn.combinedName);
  return (
    [sn.unitName1, sn.unitName2, sn.unitName3, sn.unitName4]
      .map(trim)
      .filter((v): v is string => Boolean(v))
      .join(' ') || null
  );
}

/**
 * ITIS (Integrated Taxonomic Information System) adapter (UC-739).
 * https://www.itis.gov/ws_description.html — USGS-hosted authoritative
 * taxonomic classification for North American and global species (plants,
 * animals, fungi, microbes). No auth, no key, public US Government data.
 * JSON service: https://www.itis.gov/ITISWebService/jsonservice/*
 */
export class ItisTaxonomyAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'itistaxonomy',
      baseUrl: 'https://www.itis.gov/ITISWebService/jsonservice',
      maxResponseBytes: 3_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = (req.params ?? {}) as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'itistaxonomy.search_scientific_name': {
        const qs = new URLSearchParams({ srchKey: String(p.query ?? '') });
        return {
          url: `${this.baseUrl}/searchByScientificName?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'itistaxonomy.search_common_name': {
        const qs = new URLSearchParams({ srchKey: String(p.query ?? '') });
        return {
          url: `${this.baseUrl}/searchByCommonName?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'itistaxonomy.get_full_record': {
        const qs = new URLSearchParams({ tsn: String(p.tsn ?? '') });
        return {
          url: `${this.baseUrl}/getFullRecordFromTSN?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'itistaxonomy.search_scientific_name': {
        const body = raw.body as ItisSearchByScientificNameResponse;
        const names = (body?.scientificNames ?? []).filter((n): n is NonNullable<typeof n> =>
          Boolean(n),
        );
        return {
          count: names.length,
          results: names.map((n) => ({
            tsn: n.tsn,
            scientific_name: combinedScientificName(n),
            author: trim(n.author),
            kingdom: trim(n.kingdom),
          })),
        };
      }
      case 'itistaxonomy.search_common_name': {
        const body = raw.body as ItisSearchByCommonNameResponse;
        const names = (body?.commonNames ?? []).filter((n): n is NonNullable<typeof n> =>
          Boolean(n),
        );
        return {
          count: names.length,
          results: names.map((n) => ({
            tsn: n.tsn,
            common_name: trim(n.commonName),
            language: trim(n.language),
          })),
        };
      }
      case 'itistaxonomy.get_full_record': {
        const body = raw.body as ItisFullRecordResponse;
        if (!body || !body.tsn) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `No taxonomic record found for the given TSN`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        const acceptedNames = (body.acceptedNameList?.acceptedNames ?? []).filter(
          (n): n is NonNullable<typeof n> => Boolean(n),
        );
        const commonNames = (body.commonNameList?.commonNames ?? []).filter(
          (n): n is NonNullable<typeof n> => Boolean(n),
        );
        const synonyms = (body.synonymList?.synonyms ?? []).filter(
          (n): n is NonNullable<typeof n> => Boolean(n),
        );
        return {
          tsn: body.tsn,
          scientific_name: body.scientificName ? combinedScientificName(body.scientificName) : null,
          author: trim(body.taxonAuthor?.authorship) ?? trim(body.scientificName?.author ?? null),
          kingdom: trim(body.kingdom?.kingdomName ?? null),
          rank: trim(body.taxRank?.rankName ?? null),
          taxon_usage_rating: trim(body.usage?.taxonUsageRating ?? null),
          is_valid_or_accepted:
            body.usage?.taxonUsageRating === 'valid' || body.usage?.taxonUsageRating === 'accepted',
          parent: body.hierarchyUp
            ? {
                tsn: trim(body.hierarchyUp.parentTsn),
                name: trim(body.hierarchyUp.parentName),
                rank: trim(body.hierarchyUp.rankName),
              }
            : null,
          accepted_names: acceptedNames.map((n) => ({
            tsn: n.acceptedTsn,
            name: trim(n.acceptedName),
          })),
          common_names: commonNames.map((n) => ({
            name: trim(n.commonName),
            language: trim(n.language),
          })),
          synonyms: synonyms.map((n) => ({
            tsn: n.tsn,
            name: trim(n.sciName),
          })),
        };
      }
      default:
        return raw.body;
    }
  }
}
