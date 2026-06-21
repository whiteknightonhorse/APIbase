import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CelesTrakGPElement } from './types';

const VALID_GROUPS = new Set([
  'stations',
  'weather',
  'noaa',
  'goes',
  'resource',
  'sarsat',
  'dmc',
  'tdrss',
  'argos',
  'planet',
  'spire',
  'geo',
  'intelsat',
  'ses',
  'iridium',
  'iridium-NEXT',
  'starlink',
  'oneweb',
  'orbcomm',
  'globalstar',
  'amateur',
  'cubesat',
  'other',
  'last-30-days',
  'active',
  'analyst',
  'gps-ops',
  'glo-ops',
  'galileo',
  'beidou',
  'sbas',
]);

/**
 * CelesTrak General Perturbations (GP) adapter (UC-476).
 * No auth required — US Space Force open data, public domain.
 * https://celestrak.org/NORAD/elements/
 *
 * Supported tools:
 *   celestrak.tle     → GET /NORAD/elements/gp.php?CATNR={id}&FORMAT=json  (by NORAD catalog number)
 *   celestrak.search  → GET /NORAD/elements/gp.php?NAME={name}&FORMAT=json  (by name substring)
 *   celestrak.group   → GET /NORAD/elements/gp.php?GROUP={group}&FORMAT=json (predefined group)
 *   celestrak.intdes  → GET /NORAD/elements/gp.php?INTDES={id}&FORMAT=json  (by international designator)
 */
export class CelesTrakAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'celestrak',
      baseUrl: 'https://celestrak.org',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'celestrak.tle': {
        const catnr = String(p.catnr ?? '').trim();
        if (!catnr) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'catnr (NORAD catalog number) is required',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        return {
          url: `${this.baseUrl}/NORAD/elements/gp.php?CATNR=${encodeURIComponent(catnr)}&FORMAT=json`,
          method: 'GET',
          headers,
        };
      }

      case 'celestrak.search': {
        const name = String(p.name ?? '').trim();
        if (!name) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'name is required for satellite name search',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        return {
          url: `${this.baseUrl}/NORAD/elements/gp.php?NAME=${encodeURIComponent(name)}&FORMAT=json`,
          method: 'GET',
          headers,
        };
      }

      case 'celestrak.group': {
        const group = String(p.group ?? '')
          .trim()
          .toLowerCase();
        if (!group) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'group is required',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        if (!VALID_GROUPS.has(group) && !VALID_GROUPS.has(p.group as string)) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `Unknown group "${group}". Valid groups: ${Array.from(VALID_GROUPS).join(', ')}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        return {
          url: `${this.baseUrl}/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`,
          method: 'GET',
          headers,
        };
      }

      case 'celestrak.intdes': {
        const intdes = String(p.intdes ?? '').trim();
        if (!intdes) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'intdes (international designator) is required',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        return {
          url: `${this.baseUrl}/NORAD/elements/gp.php?INTDES=${encodeURIComponent(intdes)}&FORMAT=json`,
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
    const body = raw.body;

    switch (req.toolId) {
      case 'celestrak.tle': {
        const elements = body as CelesTrakGPElement[];
        if (!Array.isArray(elements) || elements.length === 0) {
          return { found: false, element: null };
        }
        return { found: true, element: normalizeElement(elements[0]) };
      }

      case 'celestrak.search': {
        const elements = body as CelesTrakGPElement[];
        if (!Array.isArray(elements)) {
          return { total: 0, elements: [] };
        }
        return {
          total: elements.length,
          elements: elements.map(normalizeElement),
        };
      }

      case 'celestrak.group': {
        const elements = body as CelesTrakGPElement[];
        if (!Array.isArray(elements)) {
          return { total: 0, elements: [] };
        }
        return {
          total: elements.length,
          elements: elements.map(normalizeElement),
        };
      }

      case 'celestrak.intdes': {
        const elements = body as CelesTrakGPElement[];
        if (!Array.isArray(elements) || elements.length === 0) {
          return { found: false, element: null };
        }
        return {
          found: true,
          total: elements.length,
          elements: elements.map(normalizeElement),
        };
      }

      default:
        return body;
    }
  }
}

function normalizeElement(e: CelesTrakGPElement) {
  return {
    norad_cat_id: e.NORAD_CAT_ID,
    object_name: e.OBJECT_NAME,
    object_id: e.OBJECT_ID,
    epoch: e.EPOCH,
    classification: e.CLASSIFICATION_TYPE === 'U' ? 'unclassified' : e.CLASSIFICATION_TYPE,
    element_set_no: e.ELEMENT_SET_NO,
    rev_at_epoch: e.REV_AT_EPOCH,
    orbital_elements: {
      inclination_deg: e.INCLINATION,
      raan_deg: e.RA_OF_ASC_NODE,
      eccentricity: e.ECCENTRICITY,
      arg_of_perigee_deg: e.ARG_OF_PERICENTER,
      mean_anomaly_deg: e.MEAN_ANOMALY,
      mean_motion_rev_per_day: e.MEAN_MOTION,
      bstar_drag: e.BSTAR,
      mean_motion_dot: e.MEAN_MOTION_DOT,
      mean_motion_ddot: e.MEAN_MOTION_DDOT,
    },
    orbital_period_min: e.MEAN_MOTION > 0 ? +(1440 / e.MEAN_MOTION).toFixed(2) : null,
  };
}
