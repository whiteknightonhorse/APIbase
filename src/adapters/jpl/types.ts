/**
 * NASA JPL SSD API response types (UC-035).
 *
 * API host: ssd-api.jpl.nasa.gov
 * Auth: None (open access)
 *
 * Note: CAD and Fireball APIs return a flat format with
 * separate `fields` and `data` arrays that must be zipped
 * into objects by the adapter.
 */

// ---------------------------------------------------------------------------
// Close Approach Data (/cad.api) — after zip transform
// ---------------------------------------------------------------------------

export interface CloseApproachObject {
  des?: string;
  orbit_id?: string;
  jd?: string;
  cd?: string;
  dist?: string;
  dist_min?: string;
  dist_max?: string;
  v_rel?: string;
  v_inf?: string;
  t_sigma_f?: string;
  h?: string;
  fullname?: string;
  [key: string]: unknown;
}

export interface CloseApproachResponse {
  signature: { source: string; version: string };
  count: string;
  data: CloseApproachObject[];
}

// ---------------------------------------------------------------------------
// Fireball Data (/fireball.api) — after zip transform
// ---------------------------------------------------------------------------

export interface FireballObject {
  date?: string;
  energy?: string;
  'impact-e'?: string;
  lat?: string;
  'lat-dir'?: string;
  lon?: string;
  'lon-dir'?: string;
  alt?: string;
  vel?: string;
  [key: string]: unknown;
}

export interface FireballResponse {
  signature: { source: string; version: string };
  count: string;
  data: FireballObject[];
}

// ---------------------------------------------------------------------------
// Small-Body Database Lookup (/sbdb.api)
// ---------------------------------------------------------------------------

export interface SmallBodyResponse {
  signature: { source: string; version: string };
  object?: {
    fullname?: string;
    des?: string;
    kind?: string;
    prefix?: string;
    neo?: boolean;
    pha?: boolean;
    orbit_class?: { name?: string; code?: string };
    spkid?: string;
  };
  orbit?: {
    source?: string;
    epoch?: string;
    elements?: Array<{
      name?: string;
      value?: string;
      sigma?: string;
      units?: string;
      label?: string;
      title?: string;
    }>;
    equinox?: string;
    data_arc?: string;
    n_obs_used?: number;
    first_obs?: string;
    last_obs?: string;
  };
  phys_par?: Array<{
    name?: string;
    value?: string;
    sigma?: string;
    units?: string;
    ref?: string;
    desc?: string;
    title?: string;
  }>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Sentry Impact Risk (/sentry.api)
// ---------------------------------------------------------------------------

export interface SentryObject {
  des?: string;
  fullname?: string;
  ip?: string;
  ps_cum?: string;
  ps_max?: string;
  ts_max?: string;
  v_inf?: string;
  h?: string;
  diameter?: string;
  last_obs?: string;
  n_imp?: number;
  range?: string;
  [key: string]: unknown;
}

export interface SentryResponse {
  signature: { source: string; version: string };
  count: string;
  data: SentryObject[];
}
