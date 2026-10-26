import type { Request } from 'express';
import { countryOf } from './geo-lookup';
import { X_APIBASE_GEO_COUNTRY, X_APIBASE_GEO_REGION } from '../config/http-headers';

const COUNTRY_RE = /^[A-Za-z]{2}$/;
const REGION_RE = /^[A-Za-z0-9]{1,3}$/;

function pick(v: unknown, re: RegExp): string | null {
  if (typeof v !== 'string' || !re.test(v)) return null;
  return v.toUpperCase();
}

/**
 * IP geo for the UC-22 rule. Edge-proxy headers win and are honored only when the operator
 * declares the proxy trusted (INTEGRATOR_GEO_HEADERS=trusted); otherwise a client could forge
 * them. Without a trusted edge the country comes from the in-process database lookup of req.ip
 * (country level; the region stays null). Absent, untrusted, malformed or unknown values give
 * null, which means "IP rule not applied".
 */
export function geoOf(req: Pick<Request, 'headers'> & { ip?: unknown }): {
  ip_country: string | null;
  ip_region: string | null;
} {
  if (process.env.INTEGRATOR_GEO_HEADERS !== 'trusted') {
    return { ip_country: countryOf(req.ip), ip_region: null };
  }
  return {
    ip_country: pick(req.headers[X_APIBASE_GEO_COUNTRY], COUNTRY_RE),
    ip_region: pick(req.headers[X_APIBASE_GEO_REGION], REGION_RE),
  };
}
