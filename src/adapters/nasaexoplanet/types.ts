/**
 * NASA Exoplanet Archive TAP API response types (UC-456).
 *
 * API host: exoplanetarchive.ipac.caltech.edu
 * Auth: None (US Gov / Caltech IPAC open data, 17 USC §105)
 *
 * TAP (Table Access Protocol) returns JSON arrays from ADQL queries.
 * Main tables used: ps (Planetary Systems), pscomppars, stellarhosts
 */

// ---------------------------------------------------------------------------
// Planet record from `ps` table (default_flag=1 = best reference per planet)
// ---------------------------------------------------------------------------

export interface PlanetRecord {
  pl_name?: string; // Planet name (e.g. "Kepler-22 b")
  hostname?: string; // Host star name
  pl_orbper?: number; // Orbital period (days)
  pl_rade?: number; // Planet radius (Earth radii)
  pl_bmasse?: number; // Planet mass (Earth masses)
  pl_eqt?: number; // Equilibrium temperature (K)
  disc_year?: number; // Discovery year
  discoverymethod?: string; // Method (Transit, Radial Velocity, Imaging, etc.)
  disc_facility?: string; // Discovery facility / telescope
  pl_controv_flag?: number; // 1 if planet is controversial
  sy_dist?: number; // Distance to system (parsecs)
  st_spectype?: string; // Host star spectral type
  pl_orbsmax?: number; // Orbital semi-major axis (AU)
  pl_insol?: number; // Insolation flux (Earth flux)
  rowupdate?: string; // Date of last parameter update
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Stellar host record from `stellarhosts` table
// ---------------------------------------------------------------------------

export interface StellarHostRecord {
  hostname?: string;
  st_spectype?: string; // Spectral type (e.g. G2V)
  st_teff?: number; // Effective temperature (K)
  st_rad?: number; // Stellar radius (solar radii)
  st_mass?: number; // Stellar mass (solar masses)
  st_met?: number; // Metallicity [Fe/H]
  st_age?: number; // Stellar age (Gyr)
  sy_dist?: number; // System distance (parsecs)
  sy_plx?: number; // Parallax (mas)
  rastr?: string; // Right Ascension (HMS)
  decstr?: string; // Declination (DMS)
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Statistics response (aggregated counts)
// ---------------------------------------------------------------------------

export interface DiscoveryMethodStat {
  discoverymethod?: string;
  cnt?: number;
}

export interface DiscoveryYearStat {
  disc_year?: number;
  cnt?: number;
}

export interface FacilityStat {
  disc_facility?: string;
  cnt?: number;
}
