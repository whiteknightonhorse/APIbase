export interface UnpaywallOaLocation {
  is_best?: boolean;
  host_type?: string | null;
  license?: string | null;
  version?: string | null;
  url?: string | null;
  url_for_pdf?: string | null;
  url_for_landing_page?: string | null;
  repository_institution?: string | null;
  oa_date?: string | null;
}

export interface UnpaywallResponse {
  doi: string;
  doi_url?: string | null;
  title?: string | null;
  genre?: string | null;
  is_paratext?: boolean;
  published_date?: string | null;
  year?: number | null;
  publisher?: string | null;
  is_oa?: boolean;
  oa_status?: string | null;
  has_repository_copy?: boolean;
  journal_name?: string | null;
  journal_issns?: string | null;
  journal_issn_l?: string | null;
  journal_is_oa?: boolean;
  journal_is_in_doaj?: boolean;
  best_oa_location?: UnpaywallOaLocation | null;
  first_oa_location?: UnpaywallOaLocation | null;
  oa_locations?: UnpaywallOaLocation[];
  z_authors?: Array<{ given?: string; family?: string }> | null;
}

export interface UnpaywallOaLookupOutput {
  doi: string;
  doi_url: string | null;
  title: string | null;
  genre: string | null;
  published_date: string | null;
  year: number | null;
  publisher: string | null;
  authors: string[];
  is_oa: boolean;
  oa_status: string | null;
  has_repository_copy: boolean;
  journal: {
    name: string | null;
    issn_l: string | null;
    is_oa: boolean;
    is_in_doaj: boolean;
  };
  best_oa_location: {
    url: string | null;
    url_for_pdf: string | null;
    host_type: string | null;
    license: string | null;
    version: string | null;
  } | null;
  oa_locations_count: number;
  oa_locations: Array<{
    url: string | null;
    url_for_pdf: string | null;
    host_type: string | null;
    license: string | null;
    version: string | null;
    repository_institution: string | null;
  }>;
}
