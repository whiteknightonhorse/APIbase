// Raw API response types for Victoria and Albert Museum API v2

export interface VamSearchInfo {
  version: string;
  record_count: number;
  record_count_exact: boolean;
  page_size: number;
  pages: number;
  page: number;
  image_count: number;
}

export interface VamImages {
  _primary_thumbnail: string | null;
  _iiif_image_base_url: string | null;
  _iiif_presentation_url: string | null;
  imageResolution: string;
}

export interface VamSearchRecord {
  systemNumber: string;
  accessionNumber?: string;
  objectType?: string;
  _primaryTitle?: string;
  _primaryMaker?: { name?: string; association?: string };
  _primaryImageId?: string;
  _primaryDate?: string;
  _primaryPlace?: string;
  _images?: VamImages;
  _currentLocation?: {
    displayName?: string;
    type?: string;
    site?: string;
    onDisplay?: boolean;
  };
  availableToBook?: boolean;
}

export interface VamSearchResponse {
  info: VamSearchInfo;
  records: VamSearchRecord[];
}

// Museum object detail types
export interface VamTextId {
  text?: string;
  id?: string;
}

export interface VamObjectRecord {
  systemNumber: string;
  accessionNumber?: string;
  objectType?: string;
  titles?: Array<{ title?: string; type?: string }>;
  summaryDescription?: string;
  physicalDescription?: string;
  artistMakerPerson?: Array<{ name?: VamTextId; association?: VamTextId; note?: string }>;
  materials?: VamTextId[];
  techniques?: VamTextId[];
  materialsAndTechniques?: string;
  categories?: VamTextId[];
  styles?: VamTextId[];
  collectionCode?: VamTextId;
  images?: string[];
  imageResolution?: string;
  galleryLocations?: Array<{
    current?: VamTextId;
    free?: string;
    case?: string;
  }>;
  placesOfOrigin?: Array<{ place?: VamTextId; association?: VamTextId; note?: string }>;
  productionDates?: Array<{
    date?: { text?: string; earliest?: string; latest?: string };
    association?: VamTextId;
  }>;
}

export interface VamObjectResponse {
  meta?: {
    images?: {
      _primary_thumbnail?: string;
      _iiif_image?: string;
    };
  };
  record: VamObjectRecord;
}

// Normalized output types
export interface VamObjectSummary {
  system_number: string;
  accession_number: string;
  object_type: string;
  title: string;
  maker: string;
  date: string;
  place: string;
  thumbnail_url: string | null;
  iiif_image_base: string | null;
  on_display: boolean;
  location: string;
}

export interface VamSearchOutput {
  total: number;
  page: number;
  pages: number;
  results: VamObjectSummary[];
}

export interface VamObjectDetailOutput {
  system_number: string;
  accession_number: string;
  object_type: string;
  title: string;
  summary_description: string;
  physical_description: string;
  makers: Array<{ name: string; role: string }>;
  materials: string[];
  techniques: string[];
  categories: string[];
  styles: string[];
  date: string;
  date_earliest: string | null;
  date_latest: string | null;
  place_of_origin: string;
  collection: string;
  on_display: boolean;
  gallery: string;
  thumbnail_url: string | null;
  iiif_image_base: string | null;
  collection_page_url: string;
}
