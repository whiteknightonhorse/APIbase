export interface WikimediaSearchResultItem {
  ns: number;
  title: string;
  pageid: number;
  size?: number;
  wordcount?: number;
  snippet?: string;
  timestamp?: string;
}

export interface WikimediaSearchResponse {
  query?: {
    searchinfo?: { totalhits?: number };
    search?: WikimediaSearchResultItem[];
  };
  continue?: { sroffset?: number };
}

export interface WikimediaSearchOutput {
  query: string;
  total_hits: number;
  results: Array<{
    title: string;
    page_id: number;
    snippet: string;
    size_bytes: number | null;
    timestamp: string | null;
    url: string;
  }>;
}

export interface WikimediaExtMetadataField {
  value: string;
  source?: string;
  hidden?: string;
}

export interface WikimediaImageInfo {
  size?: number;
  width?: number;
  height?: number;
  mime?: string;
  url?: string;
  descriptionurl?: string;
  descriptionshorturl?: string;
  extmetadata?: Record<string, WikimediaExtMetadataField>;
}

export interface WikimediaPage {
  pageid?: number;
  ns?: number;
  title: string;
  missing?: string;
  imageinfo?: WikimediaImageInfo[];
}

export interface WikimediaFileInfoResponse {
  query?: {
    pages?: Record<string, WikimediaPage>;
  };
}

export interface WikimediaFileInfoOutput {
  title: string;
  page_id: number | null;
  found: boolean;
  url: string | null;
  description_url: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  mime: string | null;
  description: string | null;
  artist: string | null;
  credit: string | null;
  license: string | null;
  license_url: string | null;
  date: string | null;
  categories: string[];
}

export interface WikimediaCategoryMember {
  pageid: number;
  ns: number;
  title: string;
}

export interface WikimediaCategoryResponse {
  query?: { categorymembers?: WikimediaCategoryMember[] };
  continue?: { cmcontinue?: string };
}

export interface WikimediaCategoryOutput {
  category: string;
  files: Array<{ title: string; page_id: number; url: string }>;
  has_more: boolean;
  next_cursor: string | null;
}

export interface WikimediaRandomResponse {
  query?: { random?: Array<{ id: number; ns: number; title: string }> };
}

export interface WikimediaRandomOutput {
  files: Array<{ title: string; page_id: number; url: string }>;
}
