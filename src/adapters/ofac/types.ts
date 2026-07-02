/** Raw OFAC SDN CSV row (12 fields, -0- denotes null) */
export interface SdnCsvRow {
  ent_num: number;
  sdn_name: string;
  sdn_type: string;
  program: string;
  title: string;
  call_sign: string;
  voc_type: string;
  tonnage: string;
  grt: string;
  vess_flag: string;
  vess_owner: string;
  remarks: string;
}

/** Raw OFAC alt-names CSV row (5 fields) */
export interface AltCsvRow {
  ent_num: number;
  alt_num: number;
  alt_type: string;
  alt_name: string;
  alt_remarks: string;
}

export interface OfacSdnMatch {
  ent_num: number;
  name: string;
  type: string;
  program: string;
  title: string;
  remarks: string;
}

export interface OfacAlias {
  alt_num: number;
  type: string;
  name: string;
  remarks: string;
}

export interface OfacProgram {
  code: string;
  entity_count: number;
}

export interface OfacPublicationInfo {
  list_name: string;
  last_modified: string;
  sha256_digest: string;
  source_url: string;
  note: string;
}
