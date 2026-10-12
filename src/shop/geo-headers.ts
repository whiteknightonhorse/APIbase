import type { Request } from 'express';
import { X_APIBASE_GEO_COUNTRY, X_APIBASE_GEO_REGION } from '../config/http-headers';

const COUNTRY_RE = /^[A-Za-z]{2}$/;
const REGION_RE = /^[A-Za-z0-9]{1,3}$/;

function pick(v: unknown, re: RegExp): string | null {
  if (typeof v !== 'string' || !re.test(v)) return null;
  return v.toUpperCase();
}

/**
 * IP geo from the edge proxy (UC-22). The headers are honored only when the operator declares the
 * proxy trusted (INTEGRATOR_GEO_HEADERS=trusted); otherwise a client could forge them. Fail-closed:
 * absent, untrusted or malformed values give null, which means "IP rule not applied".
 */
export function geoOf(req: Pick<Request, 'headers'>): {
  ip_country: string | null;
  ip_region: string | null;
} {
  if (process.env.INTEGRATOR_GEO_HEADERS !== 'trusted') {
    return { ip_country: null, ip_region: null };
  }
  return {
    ip_country: pick(req.headers[X_APIBASE_GEO_COUNTRY], COUNTRY_RE),
    ip_region: pick(req.headers[X_APIBASE_GEO_REGION], REGION_RE),
  };
}
