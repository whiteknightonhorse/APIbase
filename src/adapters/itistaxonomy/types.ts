/**
 * ITIS (Integrated Taxonomic Information System) raw response types (UC-739).
 * https://www.itis.gov/ws_description.html — USGS-hosted taxonomic database
 * for plants, animals, fungi, and microbes of North America and the world.
 * JSON service: https://www.itis.gov/ITISWebService/jsonservice/*
 */

export interface ItisScientificName {
  author: string | null;
  combinedName: string | null;
  kingdom: string | null;
  tsn: string;
  unitName1: string | null;
  unitName2: string | null;
  unitName3: string | null;
  unitName4: string | null;
}

export interface ItisSearchByScientificNameResponse {
  scientificNames: (ItisScientificName | null)[] | null;
}

export interface ItisCommonName {
  commonName: string | null;
  language: string | null;
  tsn: string | null;
}

export interface ItisSearchByCommonNameResponse {
  commonNames: (ItisCommonName | null)[] | null;
  tsn: string | null;
}

export interface ItisAcceptedName {
  acceptedName: string | null;
  acceptedTsn: string | null;
  author: string | null;
}

export interface ItisTaxonRankInfo {
  kingdomId: string | null;
  kingdomName: string | null;
  rankId: string | null;
  rankName: string | null;
}

export interface ItisHierarchyRecord {
  author: string | null;
  parentName: string | null;
  parentTsn: string | null;
  rankName: string | null;
  taxonName: string | null;
}

export interface ItisTaxonUsageData {
  taxonUsageRating: string | null;
}

export interface ItisSynonym {
  sciName: string | null;
  tsn: string | null;
}

export interface ItisFullRecordResponse {
  tsn: string;
  kingdom?: { kingdomName: string | null } | null;
  scientificName?: ItisScientificName | null;
  taxRank?: ItisTaxonRankInfo | null;
  hierarchyUp?: ItisHierarchyRecord | null;
  usage?: ItisTaxonUsageData | null;
  acceptedNameList?: { acceptedNames: (ItisAcceptedName | null)[] | null } | null;
  commonNameList?: { commonNames: (ItisCommonName | null)[] | null } | null;
  synonymList?: { synonyms: (ItisSynonym | null)[] | null } | null;
  taxonAuthor?: { authorship: string | null; updateDate: string | null } | null;
}
