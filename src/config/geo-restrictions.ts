/**
 * Geo-restriction configuration (§8.8).
 *
 * Certain tools are restricted in specific jurisdictions for legal compliance.
 * When a request originates from a blocked jurisdiction, HTTP 451 is returned.
 */

/** Jurisdiction codes that are blocked for a given provider. */
export const GEO_RESTRICTIONS: Record<string, ReadonlySet<string>> = {
  polymarket: new Set(['US']),
};

/** Error response for geo-restricted requests. */
export interface GeoRestrictionError {
  code: 451;
  error: 'geo_restricted';
  message: string;
  jurisdiction: string;
}

/**
 * Check if a tool is geo-restricted for the given jurisdiction.
 *
 * @param toolId - dot-notation tool ID (e.g. 'polymarket.search')
 * @param jurisdiction - ISO 3166-1 alpha-2 country code (e.g. 'US')
 * @returns GeoRestrictionError if blocked, null if allowed
 */
export function checkGeoRestriction(
  toolId: string,
  jurisdiction: string | undefined,
): GeoRestrictionError | null {
  if (!jurisdiction) return null;

  const provider = toolId.split('.')[0];
  const blocked = GEO_RESTRICTIONS[provider];

  if (blocked && blocked.has(jurisdiction.toUpperCase())) {
    return {
      code: 451,
      error: 'geo_restricted',
      message: `This tool is not available in your jurisdiction (${jurisdiction.toUpperCase()})`,
      jurisdiction: jurisdiction.toUpperCase(),
    };
  }

  return null;
}
