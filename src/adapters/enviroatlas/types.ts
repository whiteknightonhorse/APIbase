/**
 * EPA EnviroAtlas ArcGIS REST API response types (UC-604).
 *
 * API host: enviroatlas.epa.gov/arcgis/rest/services
 * Auth: None (US Government open data, public domain)
 *
 * Endpoints used:
 *   Communities/Community_Locations/MapServer/0/query   — pilot community list (points)
 *   Communities/Community_BGmetrics/MapServer/2/query   — block-group ecosystem-service metrics
 *   Communities/Community_BGmetrics/MapServer/2/query   — outStatistics aggregation per community
 */

export interface ArcGisField {
  name: string;
  type: string;
  alias?: string;
}

export interface ArcGisFeature<T = Record<string, unknown>> {
  attributes: T;
}

export interface ArcGisFeatureSet<T = Record<string, unknown>> {
  fields?: ArcGisField[];
  features: ArcGisFeature<T>[];
  exceededTransferLimit?: boolean;
}

// ---------------------------------------------------------------------------
// Community_Locations/MapServer/0 — pilot community reference points
// ---------------------------------------------------------------------------

export interface CommunityLocationAttributes {
  Community: string;
  CommST: string;
  BG_Count: number;
}

export type CommunityLocationsResponse = ArcGisFeatureSet<CommunityLocationAttributes>;

// ---------------------------------------------------------------------------
// Community_BGmetrics/MapServer/2 — block-group ecosystem-service metrics
// ---------------------------------------------------------------------------

export interface BlockGroupMetricsAttributes {
  GEOID10: string;
  Community: string;
  CommST: string;
  SUM_POP10: number | null;
  NonWt_Pct: number | null;
  PLx2_Pct: number | null;
  MFor_P: number | null;
  Imp_P: number | null;
  Green_P: number | null;
  Ag_P: number | null;
  Wet_P: number | null;
  KGCSTOR: number | null;
  KGCSEQ: number | null;
  DOLCSTOR: number | null;
  DOLCSEQ: number | null;
  CORemoval: number | null;
  NO2Removal: number | null;
  O3Removal: number | null;
  PM25Remova: number | null;
  SO2Removal: number | null;
  PM10Remova: number | null;
  maxtempreduction: number | null;
  maxtempreductionnight: number | null;
  FP1_Pop_P: number | null;
  FP02_Pop_P: number | null;
  IWDP_Pct: number | null;
  WVT_Pct: number | null;
  WVW_Pct: number | null;
  Runoff: number | null;
  TSSmed: number | null;
  TPmed: number | null;
}

export type BlockGroupMetricsResponse = ArcGisFeatureSet<BlockGroupMetricsAttributes>;

// ---------------------------------------------------------------------------
// Community_BGmetrics/MapServer/2 — outStatistics aggregation
// ---------------------------------------------------------------------------

export interface CommunitySummaryStatsAttributes {
  avg_tree_cover_pct: number | null;
  avg_impervious_pct: number | null;
  avg_green_space_pct: number | null;
  total_population: number | null;
  total_carbon_stored_kg: number | null;
  total_carbon_stored_usd: number | null;
  annual_carbon_sequestration_value_usd: number | null;
  avg_flood_risk_pop_pct: number | null;
  block_group_count: number | null;
}

export type CommunitySummaryStatsResponse = ArcGisFeatureSet<CommunitySummaryStatsAttributes>;
