// ---------------------------------------------------------------------------
// e-Stat Statistics Dashboard (dashboard.e-stat.go.jp) API 1.0 — raw response
// shapes (only fields we consume). UC-671. Confirmed live before writing:
// every object is wrapped in a single named root key per operation
// (GET_STATS / GET_META_INDICATOR_INF / GET_META_REGION_INF), each holding
// RESULT (status/errorMsg), PARAMETER (echoed query), and an operation-
// specific payload. HTTP 200 + RESULT.status="1" means "valid request, zero
// matching rows" (not an error) — surfaced as-is so the agent sees errorMsg.
// ---------------------------------------------------------------------------

/** Common result envelope on every dashboard API operation. */
export interface EstatDashboardResult {
  status: string; // "0" = data found, "1" = valid request but no data
  errorMsg: string;
  date?: string;
}

// --- getData -----------------------------------------------------------

export interface EstatDashboardValue {
  '@indicator': string;
  '@unit'?: string;
  '@stat'?: string;
  '@regionCode'?: string;
  '@time': string;
  '@cycle'?: string;
  '@regionRank'?: string;
  '@isSeasonal'?: string;
  '@isProvisional'?: string;
  $: string; // numeric value, serialized as a string
}

export interface EstatDashboardDataObj {
  VALUE: EstatDashboardValue;
  CELL_ANNOTATIONS?: { $: string };
}

export interface EstatDashboardStatName {
  '@code': string;
  $: string;
}

export interface EstatDashboardGetDataResponse {
  GET_STATS: {
    RESULT: EstatDashboardResult;
    PARAMETER: Record<string, unknown>;
    STATISTICAL_DATA?: {
      RESULT_INF: { TOTAL_NUMBER: string };
      TABLE_INF?: { STAT_NAME: EstatDashboardStatName[] | EstatDashboardStatName };
      DATA_INF?: { DATA_OBJ: EstatDashboardDataObj[] | EstatDashboardDataObj };
    };
  };
}

// --- getIndicatorInfo ----------------------------------------------------

export interface EstatIndicatorClass {
  '@name': string;
  '@sname'?: string;
  '@fromDate'?: string;
  '@toDate'?: string;
  '@statName'?: string;
  '@unit'?: string;
  cycle?: { '@code': string; '@name': string };
  RegionalRank?: { '@code': string; '@name': string };
  IsSeasonal?: { '@code': string; '@name': string };
}

export interface EstatIndicatorClassObj {
  '@name': string;
  '@code': string;
  details?: { detail: Array<{ '@code': string; '@name': string; $?: string }> };
  annotations?: Array<{
    '@cycle'?: string;
    '@regionalRank'?: string;
    '@isSeasonal'?: string;
    '@annotation'?: string;
  }>;
  CLASS?: EstatIndicatorClass[] | EstatIndicatorClass;
}

export interface EstatDashboardIndicatorInfoResponse {
  GET_META_INDICATOR_INF: {
    RESULT: EstatDashboardResult;
    PARAMETER: Record<string, unknown>;
    METADATA_INF?: { CLASS_INF: { CLASS_OBJ: EstatIndicatorClassObj[] | EstatIndicatorClassObj } };
  };
}

// --- getRegionInfo ---------------------------------------------------------

export interface EstatRegionClass {
  '@regionCode': string;
  '@name': string;
  '@level': string; // "1"=world region grouping, "2"=Japan, "3"=prefecture, "4"=municipality
  '@hiragana'?: string;
  '@fromDate'?: string;
  '@toDate'?: string;
}

export interface EstatRegionClassObj {
  '@parentRegionCode'?: string;
  '@name'?: string;
  '@hiragana'?: string;
  CLASS?: EstatRegionClass[] | EstatRegionClass;
}

export interface EstatDashboardRegionInfoResponse {
  GET_META_REGION_INF: {
    RESULT: EstatDashboardResult;
    PARAMETER: Record<string, unknown>;
    METADATA_INF?: { CLASS_INF: { CLASS_OBJ: EstatRegionClassObj[] | EstatRegionClassObj } };
  };
}
