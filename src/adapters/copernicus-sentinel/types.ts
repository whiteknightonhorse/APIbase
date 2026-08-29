/** A single STAC asset (band file, thumbnail, metadata sidecar, ...). */
export interface StacAsset {
  href: string;
  type?: string;
  title?: string;
  roles?: string[];
}

/** Subset of STAC item `properties` fields actually used by this adapter. */
export interface StacItemProperties {
  datetime?: string | null;
  start_datetime?: string;
  end_datetime?: string;
  platform?: string;
  constellation?: string;
  instruments?: string[];
  'product:type'?: string;
  'eo:cloud_cover'?: number;
  'eo:snow_cover'?: number;
  'sat:orbit_state'?: string;
  gsd?: number;
  [key: string]: unknown;
}

/** A STAC Item (one satellite scene/product). */
export interface StacItem {
  id: string;
  collection?: string;
  bbox?: number[];
  geometry?: unknown;
  properties: StacItemProperties;
  assets?: Record<string, StacAsset>;
}

/** Response from POST /stac/search or GET /stac/collections/{id}/items. */
export interface StacSearchResponse {
  type: string;
  features: StacItem[];
  numberMatched?: number;
}

/** Subset of a STAC Collection summary as returned by GET /stac/collections. */
export interface StacCollectionSummary {
  id: string;
  title?: string;
  description?: string;
  license?: string;
}

/** Response from GET /stac/collections. */
export interface StacCollectionsResponse {
  collections: StacCollectionSummary[];
  numberMatched?: number;
}
