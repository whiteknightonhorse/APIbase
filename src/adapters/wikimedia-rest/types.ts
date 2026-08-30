export interface WikimediaPageSummaryResponse {
  type?: string;
  title?: string;
  displaytitle?: string;
  pageid?: number;
  extract?: string;
  extract_html?: string;
  description?: string;
  lang?: string;
  timestamp?: string;
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string; width: number; height: number };
  content_urls?: {
    desktop?: { page?: string };
    mobile?: { page?: string };
  };
}

export interface WikimediaPageSummaryOutput {
  title: string;
  description: string;
  extract: string;
  page_id: number;
  language: string;
  last_modified: string;
  thumbnail_url: string;
  article_url: string;
}

export interface WikimediaSearchPageItem {
  id: number;
  key: string;
  title: string;
  excerpt: string;
  description?: string | null;
  thumbnail?: { url?: string } | null;
}

export interface WikimediaSearchPageResponse {
  pages?: WikimediaSearchPageItem[];
}

export interface WikimediaSearchPageOutput {
  results: Array<{
    title: string;
    key: string;
    excerpt: string;
    description: string;
    thumbnail_url: string;
  }>;
}

export interface WikimediaOnThisDayItem {
  text: string;
  year?: number;
  pages?: Array<{ title: string; extract?: string }>;
}

export interface WikimediaOnThisDayResponse {
  selected?: WikimediaOnThisDayItem[];
  births?: WikimediaOnThisDayItem[];
  deaths?: WikimediaOnThisDayItem[];
  events?: WikimediaOnThisDayItem[];
  holidays?: WikimediaOnThisDayItem[];
}

export interface WikimediaOnThisDayOutput {
  type: string;
  month: string;
  day: string;
  entries: Array<{
    year: number | null;
    text: string;
    related_pages: string[];
  }>;
}

export interface WikimediaMediaListItem {
  title: string;
  type?: string;
  section_id?: number;
  showInGallery?: boolean;
  srcset?: Array<{ src: string; scale: string }>;
}

export interface WikimediaMediaListResponse {
  revision?: string;
  items?: WikimediaMediaListItem[];
}

export interface WikimediaMediaListOutput {
  revision: string;
  media: Array<{
    title: string;
    type: string;
    source_url: string;
  }>;
}
