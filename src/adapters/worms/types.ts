/**
 * World Register of Marine Species (WoRMS) response types (UC-502).
 *
 * API host: www.marinespecies.org/rest
 * Auth: none (CC BY 4.0, open access)
 * Docs: https://www.marinespecies.org/rest/
 */

// ---------------------------------------------------------------------------
// Aphia Record — returned by search and detail endpoints
// ---------------------------------------------------------------------------

export interface AphiaRecord {
  AphiaID: number;
  url: string;
  scientificname: string;
  authority: string | null;
  status: string;
  unacceptreason: string | null;
  taxonRankID: number;
  rank: string;
  valid_AphiaID: number | null;
  valid_name: string | null;
  valid_authority: string | null;
  parentNameUsageID: number | null;
  originalNameUsageID: number | null;
  kingdom: string | null;
  phylum: string | null;
  class: string | null;
  order: string | null;
  family: string | null;
  genus: string | null;
  citation: string | null;
  lsid: string | null;
  isMarine: number | null;
  isBrackish: number | null;
  isFreshwater: number | null;
  isTerrestrial: number | null;
  isExtinct: number | null;
  match_type?: string;
  modified: string | null;
}

// ---------------------------------------------------------------------------
// Aphia Classification — nested tree returned by classification endpoint
// ---------------------------------------------------------------------------

export interface AphiaClassificationNode {
  AphiaID: number;
  rank: string;
  scientificname: string;
  child?: AphiaClassificationNode;
}

// ---------------------------------------------------------------------------
// Vernacular name — returned by vernaculars endpoint
// ---------------------------------------------------------------------------

export interface AphiaVernacular {
  vernacular: string;
  language_code: string;
  language: string;
}
