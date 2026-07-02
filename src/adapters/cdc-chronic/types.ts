/**
 * CDC Chronic Disease Indicators (CDI) Socrata API response types (UC-565).
 *
 * Base URL: https://chronicdata.cdc.gov/resource/hksd-2xuw.json
 * Auth: None (US Government open data, Socrata SoQL API, public domain).
 *
 * Dataset: U.S. Chronic Disease Indicators — 398K records across 19 topics, 50 states + DC + US.
 * Updated: Annually (most recent data year: 2023).
 */

// ---------------------------------------------------------------------------
// Indicator record (main dataset row)
// ---------------------------------------------------------------------------

export interface CdcCdiRecord {
  yearstart: string;
  yearend?: string;
  locationabbr: string;
  locationdesc: string;
  datasource?: string;
  topic: string;
  question: string;
  response?: string;
  datavalueunit?: string;
  datavaluetype?: string;
  datavalue?: string;
  datavaluealt?: string;
  lowconfidencelimit?: string;
  highconfidencelimit?: string;
  stratificationcategory1?: string;
  stratification1?: string;
  stratificationcategory2?: string;
  stratification2?: string;
  locationid?: string;
  topicid?: string;
  questionid?: string;
  datavaluetypeid?: string;
  stratificationcategoryid1?: string;
  stratificationid1?: string;
  geolocation?: { type: string; coordinates: [number, number] };
}

// ---------------------------------------------------------------------------
// Topic/question list record
// ---------------------------------------------------------------------------

export interface CdcTopicRecord {
  topicid: string;
  topic: string;
  questionid: string;
  question: string;
}

// ---------------------------------------------------------------------------
// State comparison record (selected fields)
// ---------------------------------------------------------------------------

export interface CdcStateRecord {
  locationabbr: string;
  locationdesc: string;
  datavalue?: string;
  datavalueunit?: string;
  lowconfidencelimit?: string;
  highconfidencelimit?: string;
  datavaluetype?: string;
}

// ---------------------------------------------------------------------------
// Trend record (selected fields)
// ---------------------------------------------------------------------------

export interface CdcTrendRecord {
  yearstart: string;
  yearend?: string;
  datavalue?: string;
  datavalueunit?: string;
  datavaluetype?: string;
  lowconfidencelimit?: string;
  highconfidencelimit?: string;
  stratification1?: string;
}
