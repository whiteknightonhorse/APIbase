// ---------------------------------------------------------------------------
// UK Food Standards Agency (FSA) — Food Hygiene Rating Scheme (FHRS)
// Raw API response shapes (only fields we consume)
// UC-429
// ---------------------------------------------------------------------------

/**
 * Raw establishment object from GET /Establishments or /Establishments/{id}.
 */
export interface FsaEstablishment {
  FHRSID: number;
  LocalAuthorityBusinessID: string;
  BusinessName: string;
  BusinessType: string;
  BusinessTypeID: number;
  AddressLine1: string;
  AddressLine2: string;
  AddressLine3: string;
  AddressLine4: string;
  PostCode: string;
  Phone: string | null;
  RatingValue: string;
  RatingKey: string | null;
  RatingDate: string | null;
  LocalAuthorityCode: string;
  LocalAuthorityName: string;
  LocalAuthorityWebSite: string | null;
  LocalAuthorityEmailAddress: string | null;
  scores: FsaScores;
  SchemeType: string;
  geocode: FsaGeocode;
  RightToReply: string | null;
  Distance: number | null;
  NewRatingPending: boolean;
  meta: FsaMeta | null;
  links: FsaLink[];
}

export interface FsaScores {
  Hygiene: number | null;
  Structural: number | null;
  ConfidenceInManagement: number | null;
}

export interface FsaGeocode {
  longitude: string | null;
  latitude: string | null;
}

export interface FsaMeta {
  dataSource: string | null;
  extractDate: string | null;
  itemCount: number;
  returncode: string | null;
  totalCount: number;
  totalPages: number;
  pageSize: number;
  pageNumber: number;
}

export interface FsaLink {
  rel: string;
  href: string;
}

/**
 * Raw response from GET /Establishments (list).
 */
export interface FsaEstablishmentsResponse {
  establishments: FsaEstablishment[];
  meta: FsaMeta;
  links: FsaLink[];
}

/**
 * Raw authority object from GET /Authorities.
 */
export interface FsaAuthority {
  LocalAuthorityId: number;
  LocalAuthorityIdCode: string;
  Name: string;
  FriendlyName: string;
  Url: string | null;
  SchemeType: string;
  EstablishmentCount: number;
  CreationDate: string;
  LastPublishedDate: string | null;
  links: FsaLink[];
}

/**
 * Raw response from GET /Authorities.
 */
export interface FsaAuthoritiesResponse {
  authorities: FsaAuthority[];
  meta: FsaMeta;
  links: FsaLink[];
}
