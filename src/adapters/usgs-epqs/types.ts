// Raw response shape from https://epqs.nationalmap.gov/v1/json
export interface EpqsRawResponse {
  location: {
    x: number;
    y: number;
    spatialReference: { wkid: number; latestWkid: number };
  };
  locationId: number;
  // Numeric on success. Upstream returns a human-readable failure string here
  // (e.g. "Call failed.  [Failed cloud operation: Open, Path: ...]") for
  // coordinates with no DEM coverage (open ocean, outside the 3DEP extent),
  // even though the HTTP status is still 200.
  value: number | string;
  rasterId?: number;
  resolution?: number;
  attributes?: { AcquisitionDate?: string };
}
