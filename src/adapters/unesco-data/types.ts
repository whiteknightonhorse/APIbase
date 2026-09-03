// ---------------------------------------------------------------------------
// UNESCO Institute for Statistics (UIS) Data API — raw response shapes (only
// fields we consume). UC-673. Confirmed live before writing against
// https://api.uis.unesco.org/api/public/openapi/schema.json (v1.0.2):
//   - GET /api/public/definitions/indicators -> flat array, ~5,063 rows,
//     ~1.9MB unfiltered. No server-side name/theme filter exists — the
//     adapter fetches the full catalog and filters/limits client-side.
//   - GET /api/public/definitions/geounits -> flat array, 462 rows, ~39KB.
//   - GET /api/public/data/indicators -> { hints, records, indicatorMetadata }.
//     `hints` carries soft errors (e.g. unknown indicator code) alongside a
//     200 + empty `records` — not a provider error, surfaced to the agent
//     as-is. `version` query param is optional everywhere; omitting it
//     resolves to the latest published version automatically (verified
//     live), so this adapter never sends it.
// ---------------------------------------------------------------------------

export type UnescoTheme =
  | 'EDUCATION'
  | 'SCIENCE_TECHNOLOGY_INNOVATION'
  | 'CULTURE'
  | 'DEMOGRAPHIC_SOCIOECONOMIC';

export type UnescoGeoUnitType = 'NATIONAL' | 'REGIONAL';

export interface UnescoIndicatorDataAvailability {
  totalRecordCount: number;
  timeLine: { min: number; max: number };
  geoUnits: { types: UnescoGeoUnitType[] };
}

export interface UnescoIndicatorDefinition {
  indicatorCode: string;
  name: string;
  theme: UnescoTheme;
  lastDataUpdate: string;
  lastDataUpdateDescription: string;
  dataAvailability: UnescoIndicatorDataAvailability;
}

export type UnescoIndicatorDefinitionsResponse = UnescoIndicatorDefinition[];

export interface UnescoGeoUnit {
  id: string;
  name: string;
  type: UnescoGeoUnitType;
}

export type UnescoGeoUnitsResponse = UnescoGeoUnit[];

export interface UnescoDataHint {
  code: string;
  message: string;
}

export interface UnescoDataRecord {
  indicatorId: string;
  geoUnit: string;
  year: number;
  value: number;
  magnitude: string | null;
  qualifier: string | null;
}

export interface UnescoDataResponse {
  hints: UnescoDataHint[];
  records: UnescoDataRecord[];
  indicatorMetadata: unknown[];
}
