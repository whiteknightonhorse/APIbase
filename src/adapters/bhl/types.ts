// ---------------------------------------------------------------------------
// BHL API raw response types
// ---------------------------------------------------------------------------

export interface BhlRawPublication {
  BHLType?: string;
  FoundIn?: string;
  ItemID?: string;
  TitleID?: string;
  ItemUrl?: string;
  TitleUrl?: string;
  MaterialType?: string;
  PublisherPlace?: string;
  PublisherName?: string;
  PublicationDate?: string;
  Authors?: Array<{ Name?: string }>;
  Genre?: string;
  Title?: string;
}

export interface BhlRawResponse {
  Status: string;
  ErrorMessage?: string;
  Result?: unknown[];
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface BhlPublication {
  item_id: string;
  title_id: string;
  title: string;
  authors: string[];
  publisher_name: string;
  publisher_place: string;
  publication_date: string;
  material_type: string;
  genre: string;
  found_in: string;
  item_url: string;
  title_url: string;
}

export interface BhlLiteratureSearchOutput {
  total: number;
  page: number;
  results: BhlPublication[];
}

export interface BhlNameResult {
  name_confirmed: string;
}

export interface BhlNameSearchOutput {
  total: number;
  results: BhlNameResult[];
}

export interface BhlSubjectResult {
  subject: string;
}

export interface BhlSubjectSearchOutput {
  total: number;
  results: BhlSubjectResult[];
}
