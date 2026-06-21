// ---------------------------------------------------------------------------
// Normalized output types
// ---------------------------------------------------------------------------

export interface MetSearchOutput {
  total: number;
  object_ids: number[];
}

export interface MetDetailsOutput {
  object_id: number;
  title: string;
  artist: string;
  artist_nationality: string;
  date: string;
  medium: string;
  department: string;
  culture: string;
  period: string;
  dimensions: string;
  classification: string;
  is_public_domain: boolean;
  primary_image: string;
  additional_images: string[];
  gallery_number: string;
  accession_number: string;
  url: string;
}

export interface MetDepartment {
  department_id: number;
  name: string;
}

export interface MetDepartmentsOutput {
  total: number;
  departments: MetDepartment[];
}

export interface MetBrowseOutput {
  department_id: number;
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  object_ids: number[];
}
