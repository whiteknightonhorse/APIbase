// Internet Archive (archive.org) raw API response types (UC-735).

export interface ArchiveOrgSearchDoc {
  identifier: string;
  title?: string;
  mediatype?: string;
  creator?: string | string[];
  date?: string;
  description?: string | string[];
  downloads?: number;
  subject?: string | string[];
}

export interface ArchiveOrgSearchResponse {
  responseHeader: {
    status: number;
    QTime: number;
  };
  response: {
    numFound: number;
    start: number;
    docs: ArchiveOrgSearchDoc[];
  };
}

export interface ArchiveOrgFile {
  name: string;
  format?: string;
  size?: string;
  source?: string;
}

export interface ArchiveOrgMetadataResponse {
  metadata?: {
    identifier?: string;
    title?: string;
    creator?: string | string[];
    description?: string | string[];
    date?: string;
    mediatype?: string;
    subject?: string | string[];
    licenseurl?: string;
    collection?: string | string[];
  };
  files?: ArchiveOrgFile[];
  files_count?: number;
  item_size?: number;
}

export interface WaybackSnapshot {
  status: string;
  available: boolean;
  url: string;
  timestamp: string;
}

export interface WaybackAvailableResponse {
  url: string;
  archived_snapshots: {
    closest?: WaybackSnapshot;
  };
}
