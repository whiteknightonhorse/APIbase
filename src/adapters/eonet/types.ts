/**
 * NASA EONET v3 API response types (UC-477).
 *
 * API host: eonet.gsfc.nasa.gov/api/v3
 * Auth: None (US Government open data, public domain)
 * Rate limits: No documented limits
 */

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

export interface EonetCategory {
  id: string;
  title: string;
}

export interface EonetSource {
  id: string;
  url: string;
}

export interface EonetGeometry {
  magnitudeValue: number | null;
  magnitudeUnit: string | null;
  date: string;
  type: 'Point' | 'Polygon';
  coordinates: number[] | number[][][];
}

// ---------------------------------------------------------------------------
// Events list (/api/v3/events)
// ---------------------------------------------------------------------------

export interface EonetEvent {
  id: string;
  title: string;
  description: string | null;
  link: string;
  closed: string | null;
  categories: EonetCategory[];
  sources: EonetSource[];
  geometry: EonetGeometry[];
}

export interface EonetEventsResponse {
  title: string;
  description: string;
  link: string;
  events: EonetEvent[];
}

// ---------------------------------------------------------------------------
// Categories list (/api/v3/categories)
// ---------------------------------------------------------------------------

export interface EonetCategoryDetail {
  id: string;
  title: string;
  link: string;
  description: string;
  layers: string;
}

export interface EonetCategoriesResponse {
  title: string;
  description: string;
  link: string;
  categories: EonetCategoryDetail[];
}

// ---------------------------------------------------------------------------
// GIS Layers (/api/v3/layers/{categoryId})
// ---------------------------------------------------------------------------

export interface EonetLayerParameter {
  TILEMATRIXSET?: string;
  FORMAT?: string;
  [key: string]: string | undefined;
}

export interface EonetLayer {
  name: string;
  serviceUrl: string;
  serviceTypeId: string;
  parameters: EonetLayerParameter[];
}

export interface EonetLayerCategory {
  id: number | string;
  title: string;
  layers: EonetLayer[];
}

export interface EonetLayersResponse {
  title: string;
  description: string;
  link: string;
  categories: EonetLayerCategory[];
}
