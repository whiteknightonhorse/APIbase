// Raw response types for The National Map (TNM) Access API
// (tnmaccess.nationalmap.gov/api/v1).

export interface TnmProductRaw {
  title: string;
  moreInfo?: string;
  sourceId?: string;
  sourceName?: string;
  metaUrl?: string;
  publicationDate?: string;
  lastUpdated?: string;
  dateCreated?: string;
  sizeInBytes?: number;
  extent?: string;
  format?: string;
  downloadURL?: string;
  previewGraphicURL?: string;
  urls?: Record<string, string>;
  boundingBox?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export interface TnmProductsApiResponse {
  total?: number;
  items?: TnmProductRaw[];
  errors?: string[];
  messages?: string[];
  // Present (with HTTP 200) when the request itself was malformed, e.g. a
  // non-numeric bbox — the API does not use 4xx for this case.
  errorMessage?: string;
  errorType?: string;
}

export interface TnmDatasetFormat {
  displayName?: string;
  value?: string;
  isDefault?: boolean;
}

export interface TnmDatasetRaw {
  id: string;
  title: string;
  sbDatasetTag?: string;
  parentCategory?: string;
  description?: string;
  refreshCycle?: string;
  lastPublishedDate?: string;
  lastUpdatedDate?: string;
  infoUrl?: string;
  dataGovUrl?: string;
  formats?: TnmDatasetFormat[];
  defaultExtent?: string;
}
