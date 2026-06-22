/** Raw item from response=uri-meta list */
export interface OcUriMetaItem {
  label: string;
  uri: string;
  href: string;
  'citation uri'?: string;
  'project label'?: string;
  'project href'?: string;
  'context label'?: string;
  'context href'?: string;
  latitude?: number | null;
  longitude?: number | null;
  'early bce/ce'?: number | null;
  'late bce/ce'?: number | null;
  'item category'?: string;
  icon?: string;
  snippet?: string;
  thumbnail?: string;
  published?: string;
  updated?: string;
}

/** Facet option in query search results */
export interface OcFacetOption {
  id?: string;
  label?: string;
  count?: number;
  href?: string;
}

/** Single facet group */
export interface OcFacet {
  id?: string;
  label?: string;
  'oc-api:has-id-options'?: OcFacetOption[];
  'oc-api:has-range-options'?: OcFacetOption[];
}

/** Top-level query response (GeoJSON FeatureCollection with OC extensions) */
export interface OcQueryResponse {
  totalResults?: number;
  startIndex?: number;
  itemsPerPage?: number;
  'next-json'?: string;
  'allevent-start'?: number;
  'allevent-stop'?: number;
  'oc-api:has-facets'?: OcFacet[];
  Qtime?: number;
}

/** Context (site hierarchy) entry in item detail */
export interface OcContext {
  id?: string;
  label?: string;
  slug?: string;
}

/** Single observation predicate value */
export interface OcPredicateValue {
  id?: string;
  label?: string;
  slug?: string;
  '@en'?: string;
}

/** Observation block in item detail */
export interface OcObservation {
  id?: string;
  label?: string;
  [key: string]: unknown;
}

/** Subject/Media/Document item detail */
export interface OcItemDetail {
  id?: string;
  uuid?: string;
  slug?: string;
  label?: string;
  category?: string;
  type?: string;
  'dc-terms:issued'?: string;
  'dc-terms:modified'?: string;
  'dc-terms:subject'?: Array<{ id?: string; label?: string }>;
  'dc-terms:coverage'?: Array<{ id?: string; label?: string }>;
  'dc-terms:temporal'?: Array<{ id?: string; label?: string; start?: number; stop?: number }>;
  'dc-terms:creator'?: Array<{ id?: string; label?: string }>;
  'dc-terms:license'?: Array<{ id?: string; label?: string }>;
  'dc-terms:isPartOf'?: Array<{ id?: string; label?: string }>;
  'dc-terms:title'?: string;
  'oc-gen:has-contexts'?: OcContext[];
  'oc-gen:has-obs'?: OcObservation[];
  features?: Array<{ geometry?: { type?: string; coordinates?: unknown } }>;
}

/** Normalized search item output */
export interface OcSearchItem {
  label: string;
  uri: string;
  citation_uri: string;
  project_label: string;
  project_uri: string;
  context: string;
  latitude: number | null;
  longitude: number | null;
  early_bce_ce: number | null;
  late_bce_ce: number | null;
  item_category: string;
  snippet: string;
  thumbnail: string;
  published: string;
  updated: string;
}

/** Output of search tool */
export interface OcSearchOutput {
  total_results: number;
  start: number;
  rows: number;
  items: OcSearchItem[];
}

/** Single observation attribute for detail output */
export interface OcAttribute {
  predicate: string;
  values: string[];
}

/** Output of detail tool */
export interface OcDetailOutput {
  uri: string;
  uuid: string;
  label: string;
  category: string;
  title: string;
  item_type: string;
  issued: string;
  modified: string;
  context_path: string[];
  latitude: number | null;
  longitude: number | null;
  temporal_coverage: Array<{ label: string; start: number; stop: number }>;
  creators: string[];
  subjects: string[];
  observations: OcAttribute[];
  license: string;
  project: string;
}

/** Geographic facet entry */
export interface OcGeoFacet {
  label: string;
  count: number;
}

/** Project/item-type facet entry */
export interface OcCountFacet {
  label: string;
  count: number;
}

/** Output of facets tool */
export interface OcFacetsOutput {
  total_results: number;
  query_time_ms: number;
  earliest_bce_ce: number;
  latest_bce_ce: number;
  geographic_distribution: OcGeoFacet[];
  item_type_counts: OcCountFacet[];
  top_projects: OcCountFacet[];
  description_facets: OcCountFacet[];
}
