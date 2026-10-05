import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface CountriesFile {
  restricted_entity_countries: string[];
  restricted_ip_countries: string[];
  restricted_ip_regions: string[];
}

// Same runtime-read pattern as adapters/content-filter.ts (tsc rootDir is src/, so no JSON import).
const FILE = JSON.parse(
  readFileSync(resolve(__dirname, '../../../config/integrator/countries-restricted.json'), 'utf-8'),
) as CountriesFile;

const ENTITY = new Set(FILE.restricted_entity_countries);
const IP_COUNTRIES = new Set(FILE.restricted_ip_countries);
const IP_REGIONS = new Set(FILE.restricted_ip_regions);

/** UC-22: legal-entity country from the form. */
export function isRestrictedEntityCountry(cc: string): boolean {
  return ENTITY.has(cc.toUpperCase());
}

/** UC-22: IP country (comprehensively sanctioned) or `<cc>-<region>` in the restricted regions. */
export function isRestrictedIp(cc: string | null | undefined, region?: string | null): boolean {
  if (!cc) return false;
  const c = cc.toUpperCase();
  return IP_COUNTRIES.has(c) || (!!region && IP_REGIONS.has(`${c}-${region}`));
}
