/**
 * Jobs / Career Intelligence adapter response types (UC-015).
 *
 * Covers 4 upstream providers:
 *   BLS (US Bureau of Labor Statistics — salary/employment data)
 *   O*NET (occupation taxonomy — skills, knowledge, abilities)
 *   ESCO (EU Skills/Competences/Occupations — open data)
 *   CareerJet v4 (global job listings aggregator)
 */

// ---------------------------------------------------------------------------
// BLS (Bureau of Labor Statistics)
// ---------------------------------------------------------------------------

/** POST /publicAPI/v2/timeseries/data/ request body */
export interface BlsTimeseriesRequest {
  seriesid: string[];
  startyear?: string;
  endyear?: string;
  registrationkey?: string;
}

export interface BlsFootnote {
  code: string;
  text: string;
}

export interface BlsDataPoint {
  year: string;
  period: string;
  periodName: string;
  value: string;
  footnotes: BlsFootnote[];
}

export interface BlsSeries {
  seriesID: string;
  data: BlsDataPoint[];
}

export interface BlsTimeseriesResponse {
  status: string;
  responseTime: number;
  message: string[];
  Results: {
    series: BlsSeries[];
  };
}

// ---------------------------------------------------------------------------
// O*NET (Occupational Information Network)
// ---------------------------------------------------------------------------

export interface OnetOccupation {
  code: string;
  title: string;
  relevance_score: number;
  tags?: Record<string, unknown>;
}

export interface OnetSearchResponse {
  occupation: OnetOccupation[];
}

export interface OnetOccupationDetails {
  code: string;
  title: string;
  description: string;
  sample_of_reported_titles?: Record<string, unknown>;
  updated?: string;
}

export interface OnetElement {
  id: string;
  name: string;
  description: string;
  score?: {
    value: string;
    scale_name?: string;
  };
}

export interface OnetSummaryResponse {
  element: OnetElement[];
}

// ---------------------------------------------------------------------------
// ESCO (European Skills/Competences/Occupations)
// ---------------------------------------------------------------------------

export interface EscoResult {
  uri: string;
  title: string;
  className: string;
}

export interface EscoSearchResponse {
  _embedded: {
    results: EscoResult[];
  };
  _links: Record<string, unknown>;
  total: number;
}

export interface EscoOccupation {
  uri: string;
  title: string;
  description: string;
  hasEssentialSkill?: Record<string, unknown>[];
  hasOptionalSkill?: Record<string, unknown>[];
  code?: string;
}

export interface EscoSkill {
  uri: string;
  title: string;
  description: string;
  skillType: string;
}

// ---------------------------------------------------------------------------
// CareerJet v4
// ---------------------------------------------------------------------------

export interface CareerJetJob {
  title: string;
  company: string;
  date: string;
  description: string;
  locations: string;
  salary: string;
  salary_currency_code: string;
  salary_max: number;
  salary_min: number;
  salary_type: string;
  site: string;
  url: string;
}

export interface CareerJetResponse {
  type: string;
  hits: number;
  message: string;
  pages: number;
  response_time: number;
  jobs: CareerJetJob[];
}
