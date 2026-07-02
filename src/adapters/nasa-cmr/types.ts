/**
 * NASA CMR (Common Metadata Repository) response types (UC-578).
 *
 * API host: cmr.earthdata.nasa.gov/search
 * Auth: None (NASA open data, CC0 / US Gov public domain)
 * Docs: https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html
 */

// ---------------------------------------------------------------------------
// Collections search (/search/collections.json)
// ---------------------------------------------------------------------------

export interface CmrCollectionEntry {
  id: string;
  title: string;
  summary: string;
  updated: string;
  dataset_id?: string;
  entry_id?: string;
  short_name?: string;
  version_id?: string;
  data_center?: string;
  archive_center?: string;
  processing_level_id?: string;
  coordinate_system?: string;
  time_start?: string;
  time_end?: string;
  original_format?: string;
  cloud_hosted?: boolean;
  has_transforms?: boolean;
  has_variables?: boolean;
  has_spatial_subsetting?: boolean;
  has_temporal_subsetting?: boolean;
  online_access_flag?: boolean;
  browse_flag?: boolean;
  platforms?: string[];
  organizations?: string[];
  boxes?: string[];
}

export interface CmrCollectionFeed {
  updated: string;
  id: string;
  title: string;
  entry: CmrCollectionEntry[];
}

export interface CmrCollectionsResponse {
  feed: CmrCollectionFeed;
}

// ---------------------------------------------------------------------------
// Collection UMM detail (/search/collections.umm_json?concept_id=)
// ---------------------------------------------------------------------------

export interface CmrUmmTemporalExtent {
  RangeDateTimes?: Array<{
    BeginningDateTime?: string;
    EndingDateTime?: string;
  }>;
  SingleDateTimes?: string[];
}

export interface CmrUmmPlatform {
  Type?: string;
  ShortName?: string;
  LongName?: string;
  Instruments?: Array<{ ShortName?: string; LongName?: string }>;
}

export interface CmrUmmScienceKeyword {
  Category?: string;
  Topic?: string;
  Term?: string;
  VariableLevel1?: string;
}

export interface CmrUmmCollection {
  ShortName?: string;
  Version?: string;
  EntryTitle?: string;
  Abstract?: string;
  ProcessingLevel?: { Id?: string };
  CollectionDataType?: string;
  DataCenters?: Array<{ Roles?: string[]; ShortName?: string; LongName?: string }>;
  Platforms?: CmrUmmPlatform[];
  TemporalExtents?: CmrUmmTemporalExtent[];
  ScienceKeywords?: CmrUmmScienceKeyword[];
  SpatialExtent?: Record<string, unknown>;
  RelatedUrls?: Array<{ URL?: string; Type?: string; Subtype?: string; Description?: string }>;
  DOI?: { DOI?: string; Authority?: string };
}

export interface CmrUmmItem {
  meta: {
    'concept-id': string;
    'concept-type'?: string;
    'native-id'?: string;
    'provider-id'?: string;
    'revision-id'?: number;
    'revision-date'?: string;
  };
  umm: CmrUmmCollection;
}

export interface CmrUmmCollectionsResponse {
  hits: number;
  took: number;
  items: CmrUmmItem[];
}

// ---------------------------------------------------------------------------
// Granules search (/search/granules.json)
// ---------------------------------------------------------------------------

export interface CmrGranuleLink {
  rel?: string;
  type?: string;
  href?: string;
  inherited?: boolean;
}

export interface CmrGranuleEntry {
  id: string;
  title: string;
  updated: string;
  producer_granule_id?: string;
  dataset_id?: string;
  data_center?: string;
  coordinate_system?: string;
  time_start?: string;
  time_end?: string;
  day_night_flag?: string;
  cloud_cover?: number;
  granule_size?: number;
  browse_flag?: boolean;
  online_access_flag?: boolean;
  original_format?: string;
  collection_concept_id?: string;
  links?: CmrGranuleLink[];
  boxes?: string[];
  polygons?: string[][];
}

export interface CmrGranulesFeed {
  updated: string;
  id: string;
  title: string;
  entry: CmrGranuleEntry[];
}

export interface CmrGranulesResponse {
  feed: CmrGranulesFeed;
}

// ---------------------------------------------------------------------------
// Providers list (/search/providers)
// ---------------------------------------------------------------------------

export interface CmrProviderOrganization {
  ShortName?: string;
  LongName?: string;
  URLValue?: string;
  Roles?: string[];
}

export interface CmrProvider {
  ProviderId: string;
  DescriptionOfHolding?: string;
  Organizations?: CmrProviderOrganization[];
  Consortiums?: string[];
}

export interface CmrProvidersResponse {
  hits: number;
  took: number;
  items: CmrProvider[];
}
