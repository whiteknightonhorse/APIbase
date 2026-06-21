/**
 * US Drought Monitor (USDM) data services API response types (UC-482).
 *
 * API host: usdmdataservices.unl.edu
 * Auth: None (US Government public domain — NOAA/USDA/University of Nebraska–Lincoln)
 *
 * Endpoints (JSON via Accept: application/json):
 *   /api/USStatistics/GetDroughtSeverityStatisticsByArea  — national area (sq miles)
 *   /api/USStatistics/GetDroughtSeverityStatisticsByAreaPercent — national % of total
 *   /api/USStatistics/GetDSCI                            — national composite index
 *   /api/CountyStatistics/GetDroughtSeverityStatisticsByArea — county-level area
 *   /api/ConsecutiveNonConsecutiveStatistics/GetNonConsecutiveStatisticsCounty
 *   /api/ConsecutiveNonConsecutiveStatistics/GetConsecutiveWeeksCounty
 */

// ---------------------------------------------------------------------------
// National statistics record
// ---------------------------------------------------------------------------

/** One weekly release row at the national (CONUS / Total) level. */
export interface DroughtNationalRecord {
  /** Map publication date (ISO 8601 datetime, always midnight). */
  mapDate: string;
  /** Area of interest: "CONUS" or "Total" (includes non-contiguous territories). */
  areaOfInterest: string;
  /** Area or percent with NO drought condition. */
  none: number;
  /** Area or percent at D0 (Abnormally Dry) or worse (cumulative) / exactly D0 (categorical). */
  d0: number;
  /** Area or percent at D1 (Moderate Drought) or worse / exactly D1. */
  d1: number;
  /** Area or percent at D2 (Severe Drought) or worse / exactly D2. */
  d2: number;
  /** Area or percent at D3 (Extreme Drought) or worse / exactly D3. */
  d3: number;
  /** Area or percent at D4 (Exceptional Drought). */
  d4: number;
  /** Start of the week covered by this map (ISO 8601 datetime). */
  validStart: string;
  /** End of the week covered by this map (ISO 8601 datetime). */
  validEnd: string;
  /** 1 = cumulative (each level includes worse), 2 = categorical (non-overlapping). */
  statisticFormatID: number;
}

// ---------------------------------------------------------------------------
// DSCI record
// ---------------------------------------------------------------------------

/** Drought Severity and Coverage Index — one composite score per area per week. */
export interface DroughtDsciRecord {
  /** Area of interest name ("CONUS" or "Total"). */
  name: string;
  /** Map publication date (ISO 8601 datetime). */
  mapDate: string;
  /** DSCI score 0 (no drought) → 500 (100% in D4 Exceptional Drought). */
  dsci: number;
}

// ---------------------------------------------------------------------------
// County statistics record
// ---------------------------------------------------------------------------

/** One weekly release row at the county level. */
export interface DroughtCountyRecord {
  /** Map publication date (ISO 8601 datetime). */
  mapDate: string;
  /** Five-digit FIPS code (e.g. "48113" for Dallas County, TX). */
  fips: string;
  /** County name including "County" suffix (e.g. "Dallas County"). */
  county: string;
  /** Two-letter state abbreviation. */
  state: string;
  none: number;
  d0: number;
  d1: number;
  d2: number;
  d3: number;
  d4: number;
  /** Start of the week covered by this map (ISO 8601 datetime). */
  validStart: string;
  /** End of the week covered by this map (ISO 8601 datetime). */
  validEnd: string;
  /** 1 = cumulative, 2 = categorical. */
  statisticFormatID: number;
}

// ---------------------------------------------------------------------------
// Weeks-in-drought record
// ---------------------------------------------------------------------------

/** County-level count of weeks spent in drought at or above a threshold. */
export interface DroughtWeeksRecord {
  /** Five-digit FIPS code. */
  fips: string;
  /** County name. */
  county: string;
  /** Two-letter state abbreviation. */
  state: string;
  /** Number of consecutive weeks at or above the drought threshold. */
  consecutiveWeeks?: number;
  /** Number of non-consecutive weeks at or above the drought threshold. */
  nonConsecutiveWeeks?: number;
}
