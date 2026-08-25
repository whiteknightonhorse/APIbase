// Standard Ebooks OPDS 2.0 JSON search response (UC-600)
// https://standardebooks.org/feeds/opds/all?query=...

export interface OpdsAuthor {
  name: string;
  sortAs?: string;
  links?: Array<{ href: string; rel: string[]; type: string }>;
}

export interface OpdsSubject {
  name: string;
  scheme?: string;
}

export interface OpdsLink {
  href: string;
  rel: string[];
  type: string;
  title?: string;
  size?: number;
}

export interface OpdsPublication {
  metadata: {
    identifier: string;
    title: string;
    author: OpdsAuthor[];
    language?: string;
    publisher?: string;
    description?: string;
    belongsTo?: { subjects?: OpdsSubject[] };
    published?: string;
    modified?: string;
  };
  images?: OpdsLink[];
  links: OpdsLink[];
}

export interface OpdsSearchResponse {
  metadata: {
    title: string;
    modified: string;
    subtitle?: string;
  };
  publications: OpdsPublication[];
}

// Parsed Atom feed entry (new-releases, XML — no auth, but no OPDS JSON variant)
export interface AtomEntry {
  id: string;
  title: string;
  authorName: string;
  authorUrl: string;
  published: string;
  updated: string;
  summary: string;
  subjects: string[];
  thumbnailUrl: string | null;
  formats: SimplifiedFormats;
}

export interface SimplifiedFormats {
  page_url: string;
  epub_url: string | null;
  epub_advanced_url: string | null;
  kepub_url: string | null;
  azw3_url: string | null;
  text_url: string | null;
}

export interface SimplifiedBook {
  title: string;
  author: string;
  author_url: string;
  language: string | null;
  description: string;
  subjects: string[];
  published: string | null;
  modified: string | null;
  cover_url: string | null;
  formats: SimplifiedFormats;
}
