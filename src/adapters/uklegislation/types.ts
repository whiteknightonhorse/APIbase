export interface UkLegSearchItem {
  title: string;
  type: string;
  year: number;
  number: number;
  url: string;
  id_url: string;
  summary: string | null;
  enacted: string | null;
  updated: string;
  categories: string[];
}

export interface UkLegSearchOutput {
  total_results: number;
  page: number;
  items_per_page: number;
  has_more: boolean;
  legislation: UkLegSearchItem[];
}

export interface UkLegSection {
  type: string;
  number: string;
  title: string;
  url: string;
}

export interface UkLegDetailsOutput {
  title: string;
  type: string;
  year: number;
  number: number;
  url: string;
  id_url: string;
  status: string | null;
  enacted: string | null;
  modified: string | null;
  body_paragraphs: number | null;
  schedule_paragraphs: number | null;
  extent: string | null;
  sections: UkLegSection[];
}

export interface UkLegRecentItem {
  title: string;
  type: string;
  year: number;
  number: number;
  url: string;
  updated: string;
  enacted: string | null;
  summary: string | null;
}

export interface UkLegRecentOutput {
  legislation: UkLegRecentItem[];
}

export interface UkLegSectionsOutput {
  title: string;
  type: string;
  year: number;
  number: number;
  sections: UkLegSection[];
  section_count: number;
}
