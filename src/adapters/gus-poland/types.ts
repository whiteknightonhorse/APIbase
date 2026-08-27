/** GUS BDL (Bank Danych Lokalnych) API v1 raw response types (UC-617). */

export interface BdlPagedLinks {
  first?: string;
  self?: string;
  next?: string;
  prev?: string;
  last?: string;
}

export interface BdlSubject {
  id: string;
  parentId?: string;
  name: string;
  hasVariables: boolean;
  children?: string[];
  levels?: number[];
}

export interface BdlPagedSubjects {
  totalRecords: number;
  page: number;
  pageSize: number;
  links?: BdlPagedLinks;
  results: BdlSubject[];
}

export interface BdlVariable {
  id: number;
  subjectId: string;
  n1?: string;
  n2?: string;
  n3?: string;
  level: number;
  measureUnitId: number;
  measureUnitName: string;
}

export interface BdlPagedVariables {
  totalRecords: number;
  page: number;
  pageSize: number;
  links?: BdlPagedLinks;
  results: BdlVariable[];
}

export interface BdlDataValue {
  year: string;
  val: number | null;
  attrId: number;
}

export interface BdlDataUnit {
  id: string;
  name: string;
  values: BdlDataValue[];
}

export interface BdlDataResponse {
  totalRecords: number;
  links?: BdlPagedLinks;
  variableId?: number;
  measureUnitId?: number;
  aggregateId?: number;
  lastUpdate: string | null;
  results: BdlDataUnit[];
}

/** GUS BDL returns quota-exceeded errors as HTTP 200 with this body shape. */
export interface BdlErrorResult {
  errorResult: string;
}
