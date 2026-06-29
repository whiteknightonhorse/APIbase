/**
 * OpenTopography API raw response types (UC-537).
 *
 * Portal: https://portal.opentopography.org
 * Auth: API key (free registration, 5K req/day)
 *
 * Elevation tools use AAIGrid ASCII text — we parse it here into JSON.
 * Catalog tool uses native JSON from /API/otCatalog.
 */

/** Parsed AAIGrid elevation result after text-to-JSON conversion. */
export interface AaiGridResult {
  elevation_m: number | null;
  lat: number;
  lon: number;
  dataset: string;
  ncols: number;
  nrows: number;
  cellsize: number;
  nodata_value: number;
}

/** Parsed area elevation statistics. */
export interface AreaElevationResult {
  dataset: string;
  south: number;
  north: number;
  west: number;
  east: number;
  ncols: number;
  nrows: number;
  cell_count: number;
  valid_cells: number;
  nodata_cells: number;
  min_m: number;
  max_m: number;
  mean_m: number;
  cellsize_deg: number;
}

/** Single dataset entry from /API/otCatalog. */
export interface CatalogDatasetRaw {
  Dataset: {
    name: string;
    identifier?: {
      '@type'?: string;
      propertyID?: string;
      value?: string;
    };
    alternateName?: string;
    url?: string;
    fileFormat?: string;
    dateCreated?: string;
    description?: string;
    temporalCoverage?: string;
    spatialCoverage?: {
      geo?: {
        box?: string;
      };
    };
  };
}

/** Raw response from /API/otCatalog. */
export interface CatalogResponse {
  Datasets?: CatalogDatasetRaw[];
}
