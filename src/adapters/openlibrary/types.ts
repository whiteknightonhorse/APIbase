/**
 * Open Library API response types (UC-054).
 *
 * API host: openlibrary.org
 * Auth: None (CC0 public domain, Internet Archive)
 *
 * Note: /isbn/{ISBN}.json returns 302 redirect to /books/{OLID}.json.
 * fetch() follows redirects by default.
 */

// ---------------------------------------------------------------------------
// ISBN / Edition lookup (/isbn/{ISBN}.json → /books/{OLID}.json)
// ---------------------------------------------------------------------------

export interface OlEdition {
  key: string;
  title: string;
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  isbn_10?: string[];
  isbn_13?: string[];
  covers?: number[];
  languages?: Array<{ key: string }>;
  works?: Array<{ key: string }>;
  subjects?: string[];
  description?: string | { value: string };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Search (/search.json)
// ---------------------------------------------------------------------------

export interface OlSearchDoc {
  key: string;
  title: string;
  author_name?: string[];
  author_key?: string[];
  first_publish_year?: number;
  isbn?: string[];
  publisher?: string[];
  language?: string[];
  subject?: string[];
  cover_i?: number;
  edition_count?: number;
  number_of_pages_median?: number;
  ratings_average?: number;
  ratings_count?: number;
  [key: string]: unknown;
}

export interface OlSearchResponse {
  numFound: number;
  start: number;
  docs: OlSearchDoc[];
}

// ---------------------------------------------------------------------------
// Work (/works/{OLID}.json)
// ---------------------------------------------------------------------------

export interface OlWork {
  key: string;
  title: string;
  description?: string | { value: string };
  subjects?: string[];
  subject_places?: string[];
  subject_times?: string[];
  authors?: Array<{ author: { key: string }; type?: { key: string } }>;
  covers?: number[];
  first_publish_date?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Author (/authors/{OLID}.json)
// ---------------------------------------------------------------------------

export interface OlAuthor {
  key: string;
  name: string;
  personal_name?: string;
  birth_date?: string;
  death_date?: string;
  bio?: string | { value: string };
  wikipedia?: string;
  photos?: number[];
  links?: Array<{ url: string; title: string }>;
  [key: string]: unknown;
}
