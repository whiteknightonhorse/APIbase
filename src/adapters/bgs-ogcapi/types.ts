/** British Geological Survey OGC API Features raw response types (UC-650). */

export interface BgsGeoJsonFeature<P> {
  type: 'Feature';
  properties: P;
  geometry?: {
    type: string;
    coordinates: number[];
  } | null;
}

export interface BgsFeatureCollection<P> {
  type: 'FeatureCollection';
  numberReturned?: number;
  numberMatched?: number;
  features: Array<BgsGeoJsonFeature<P>>;
}

export interface BgsBedrockProperties {
  lex?: string;
  lex_d?: string;
  rcs?: string;
  rcs_d?: string;
  rank?: string;
  max_time_d?: string;
  min_time_d?: string;
  max_time_y?: number;
  min_time_y?: number;
  bgstype?: string;
  sheet?: string;
  released?: string;
}

export interface BgsEarthquakeProperties {
  earthquake_event_id?: number;
  datetime?: string;
  year?: string;
  latitude?: number;
  longitude?: number;
  depth?: number;
  ml?: number;
  intensity?: number;
}

export interface BgsBoreholeProperties {
  reference?: string;
  name?: string;
  grid_ref?: string;
  easting?: number;
  northing?: number;
  precision?: string;
  length?: number;
  year_known?: number | string | null;
  held_at?: string;
  bgs_id?: number;
  scan_url?: string | null;
  ags_log_url?: string | null;
  water_well_ref?: string;
}

export interface BgsLandslideProperties {
  landslide_number?: number;
  landslide_name?: string;
  locality_details?: string;
  easting?: number;
  northing?: number;
  plus_or_minus_metres?: number;
  ls_id?: number;
  first_known_date_year?: string;
  last_known_date_year?: string;
}
