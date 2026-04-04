// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface PypiPackageOutput {
  name: string;
  version: string;
  summary: string;
  description_type: string;
  license: string;
  author: string;
  author_email: string;
  homepage: string;
  repository: string;
  documentation: string;
  requires_python: string;
  keywords: string[];
  classifiers: string[];
  dependencies: string[];
}

export interface PypiReleaseEntry {
  version: string;
  upload_date: string;
  yanked: boolean;
  file_types: string[];
}

export interface PypiReleasesOutput {
  name: string;
  latest: string;
  total_versions: number;
  versions: PypiReleaseEntry[];
}
