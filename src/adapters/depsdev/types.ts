// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface DepsdevVersionInfo {
  version: string;
  published: string;
  is_default: boolean;
}

export interface DepsdevPackageOutput {
  name: string;
  system: string;
  default_version: string;
  total_versions: number;
  versions: DepsdevVersionInfo[];
}

export interface DepsdevDepNode {
  system: string;
  name: string;
  version: string;
  relation: string;
}

export interface DepsdevDependenciesOutput {
  package: string;
  version: string;
  system: string;
  total_dependencies: number;
  dependencies: DepsdevDepNode[];
}

export interface DepsdevAdvisory {
  id: string;
  url: string;
  title: string;
  aliases: string[];
}

export interface DepsdevAdvisoriesOutput {
  package: string;
  version: string;
  system: string;
  total_advisories: number;
  advisories: DepsdevAdvisory[];
}
