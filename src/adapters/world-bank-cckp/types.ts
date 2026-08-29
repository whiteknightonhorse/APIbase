// Raw response shape for the World Bank Climate Change Knowledge Portal (CCKP) API
// (cckpapi.worldbank.org/cckp/v1). Every endpoint returns the same envelope; `data` maps
// a geo_code (ISO3 country, region_XXX, or admin1 sub-code) to a map of period -> value.

export interface CckpMetadata {
  apiVersion: string;
  status: 'success' | 'error';
  messages?: string[];
  message?: string[];
}

export interface CckpResponse {
  metadata: CckpMetadata;
  data: Record<string, Record<string, number>> | [];
}
