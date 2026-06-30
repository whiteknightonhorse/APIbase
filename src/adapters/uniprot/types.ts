export interface UniprotProteinName {
  fullName: { value: string };
  shortNames?: Array<{ value: string }>;
  ecNumbers?: Array<{ value: string }>;
}

export interface UniprotOrganism {
  scientificName: string;
  commonName?: string;
  taxonId: number;
  lineage?: string[];
}

export interface UniprotGene {
  geneName?: { value: string };
  synonyms?: Array<{ value: string }>;
}

export interface UniprotSequence {
  value: string;
  length: number;
  molWeight: number;
  crc64?: string;
  md5?: string;
}

export interface UniprotFeature {
  type: string;
  description?: string;
  evidences?: Array<{ evidenceCode: string }>;
  location: {
    start: { value: number; modifier: string };
    end: { value: number; modifier: string };
  };
  featureCrossReferences?: Array<{ database: string; id: string }>;
}

export interface UniprotComment {
  commentType: string;
  texts?: Array<{ value: string }>;
  disease?: { diseaseId: string; description: string; acronym?: string };
  subcellularLocations?: Array<{
    location: { value: string };
    topology?: { value: string };
  }>;
}

export interface UniprotCrossRef {
  database: string;
  id: string;
  properties?: Array<{ key: string; value: string }>;
}

export interface UniprotEntry {
  entryType: string;
  primaryAccession: string;
  uniProtkbId: string;
  annotationScore: number;
  organism: UniprotOrganism;
  proteinDescription: {
    recommendedName?: UniprotProteinName;
    alternativeNames?: UniprotProteinName[];
  };
  genes?: UniprotGene[];
  comments?: UniprotComment[];
  features?: UniprotFeature[];
  keywords?: Array<{ name: string; category: string }>;
  sequence: UniprotSequence;
  uniProtKBCrossReferences?: UniprotCrossRef[];
}

export interface UniprotSearchResponse {
  results: UniprotEntry[];
}

export interface UniprotTaxonomy {
  taxonId: number;
  scientificName: string;
  commonName?: string;
  rank?: string;
  lineage?: string[];
  links?: string[];
  statistics?: {
    reviewedProteinCount?: number;
    unreviewedProteinCount?: number;
  };
}

export interface UniprotTaxonomySearchResponse {
  results: UniprotTaxonomy[];
}
