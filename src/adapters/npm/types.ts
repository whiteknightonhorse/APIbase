// ---------------------------------------------------------------------------
// Raw npm Registry API response shapes
// ---------------------------------------------------------------------------

export interface NpmMaintainer {
  name: string;
  email?: string;
}

export interface NpmRepository {
  type?: string;
  url?: string;
}

export interface NpmPackageManifest {
  name: string;
  version: string;
  description?: string;
  license?: string;
  keywords?: string[];
  homepage?: string;
  repository?: NpmRepository;
  author?: { name?: string; email?: string; url?: string } | string;
  maintainers?: NpmMaintainer[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  deprecated?: string;
}

export interface NpmDownloadsResponse {
  downloads: number;
  start: string;
  end: string;
  package: string;
}

export interface NpmSearchObject {
  package: {
    name: string;
    version: string;
    description?: string;
    keywords?: string[];
    publisher?: { username: string; email?: string };
    maintainers?: NpmMaintainer[];
    license?: string;
    date: string;
    links?: { npm?: string; homepage?: string; repository?: string };
  };
  score: {
    final: number;
    detail: { quality: number; popularity: number; maintenance: number };
  };
  downloads?: number;
  dependents?: number;
  searchScore: number;
}

export interface NpmSearchResponse {
  objects: NpmSearchObject[];
  total: number;
  time: string;
}

export interface NpmAbbreviatedVersion {
  name: string;
  version: string;
  deprecated?: string;
  dist?: { tarball?: string; shasum?: string };
}

export interface NpmAbbreviatedManifest {
  name: string;
  'dist-tags': Record<string, string>;
  versions: Record<string, NpmAbbreviatedVersion>;
  modified: string;
}

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface NpmPackageOutput {
  name: string;
  version: string;
  description: string;
  license: string;
  homepage: string;
  repository: string;
  author: string;
  maintainers: string[];
  keywords: string[];
  dependencies: Record<string, string>;
  dev_dependencies_count: number;
  peer_dependencies: Record<string, string>;
  engines: Record<string, string>;
  deprecated: string | null;
}

export interface NpmDownloadsOutput {
  package: string;
  downloads: number;
  period_start: string;
  period_end: string;
}

export interface NpmSearchItem {
  name: string;
  version: string;
  description: string;
  license: string;
  date: string;
  publisher: string;
  keywords: string[];
  score: number;
  quality: number;
  popularity: number;
  maintenance: number;
  downloads: number | null;
  dependents: number | null;
  npm_url: string;
}

export interface NpmSearchOutput {
  total: number;
  results: NpmSearchItem[];
}

export interface NpmVersionEntry {
  version: string;
  deprecated: boolean;
}

export interface NpmVersionsOutput {
  name: string;
  dist_tags: Record<string, string>;
  total_versions: number;
  modified: string;
  versions: NpmVersionEntry[];
}
