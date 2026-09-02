/** Raw shapes returned by the CZSO (Czech Statistical Office) open-data catalog. */

/** `GET /pll/eweb/package_list` — flat array of every dataset id (capped ~1000, no pagination). */
export interface CzsoPackageListResponse {
  success: boolean;
  result?: string[];
}

export interface CzsoResource {
  url?: string;
  format?: string;
  name?: string;
  description?: string;
}

export interface CzsoPackageResult {
  name: string;
  title: string;
  notes?: string;
  frequency?: string;
  temporal_start?: string;
  temporal_end?: string;
  tags?: { name: string; display_name?: string }[];
  resources?: CzsoResource[];
}

/** `GET /pll/eweb/package_show?id=...` — single dataset's metadata (CKAN-style). */
export interface CzsoPackageShowResponse {
  success: boolean;
  result?: CzsoPackageResult;
  error?: { message?: string };
}
