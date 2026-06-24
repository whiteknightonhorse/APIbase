/**
 * UK National Grid Carbon Intensity API response types (UC-513).
 *
 * API host: https://api.carbonintensity.org.uk
 * Auth: None (CC BY 4.0, UK National Grid ESO)
 *
 * Endpoints:
 *   /intensity            — current national carbon intensity
 *   /generation           — current national generation mix
 *   /regional             — all-regions intensity + generation mix
 *   /intensity/fw24h      — 24-hour ahead national intensity forecast
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface IntensityData {
  forecast: number;
  actual?: number;
  index: 'very low' | 'low' | 'moderate' | 'high' | 'very high';
}

export interface GenerationSource {
  fuel: string;
  perc: number;
}

export interface IntensityPeriod {
  from: string;
  to: string;
  intensity: IntensityData;
}

// ---------------------------------------------------------------------------
// /intensity — current national carbon intensity
// ---------------------------------------------------------------------------

export interface CurrentIntensityResponse {
  data: IntensityPeriod[];
}

// ---------------------------------------------------------------------------
// /generation — current national generation mix
// ---------------------------------------------------------------------------

export interface GenerationMixResponse {
  data: {
    from: string;
    to: string;
    generationmix: GenerationSource[];
  };
}

// ---------------------------------------------------------------------------
// /regional — all regions intensity + generation mix
// ---------------------------------------------------------------------------

export interface RegionData {
  regionid: number;
  dnoregion: string;
  shortname: string;
  intensity: {
    forecast: number;
    index: string;
  };
  generationmix: GenerationSource[];
}

export interface RegionalResponse {
  data: {
    from?: string;
    to?: string;
    regions: RegionData[];
  }[];
}

// ---------------------------------------------------------------------------
// /intensity/fw24h — 24-hour ahead forecast
// ---------------------------------------------------------------------------

export interface ForecastPeriod {
  from: string;
  to: string;
  intensity: {
    forecast: number;
    index: string;
  };
}

export interface ForecastResponse {
  data: ForecastPeriod[];
}
