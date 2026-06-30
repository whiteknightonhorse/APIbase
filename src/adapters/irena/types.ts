// IRENA PX-Web API response types (UC-550)

export interface PxWebTableRef {
  id: string;
  type: string;
  text: string;
  updated?: string;
}

export interface PxWebVariable {
  code: string;
  text: string;
  values: string[];
  valueTexts?: string[];
}

export interface PxWebMetadata {
  title: string;
  variables: PxWebVariable[];
}

export interface PxWebDataRow {
  key: string[];
  values: string[];
}

export interface PxWebQueryResponse {
  columns: Array<{ code: string; text: string; type: string }>;
  comments: unknown[];
  data: PxWebDataRow[];
  metadata?: Array<{ updated: string; label: string; source: string }>;
}

// ---- Parsed output types ----

export interface CapacityRow {
  country: string;
  technology: string;
  grid_connection: string;
  year: number;
  capacity_mw: number | null;
}

export interface GenerationRow {
  country: string;
  technology: string;
  grid_connection: string;
  year: number;
  generation_gwh: number | null;
}

export interface RegionCapacityRow {
  region: string;
  technology: string;
  grid_connection: string;
  year: number;
  capacity_mw: number | null;
}

export interface ShareRow {
  country_or_region: string;
  indicator: string;
  year: number;
  share_pct: number | null;
}

export interface IrenaCapacityOutput {
  source: string;
  unit: string;
  data: CapacityRow[];
}

export interface IrenaGenerationOutput {
  source: string;
  unit: string;
  data: GenerationRow[];
}

export interface IrenaRegionCapacityOutput {
  source: string;
  unit: string;
  data: RegionCapacityRow[];
}

export interface IrenaShareOutput {
  source: string;
  unit: string;
  data: ShareRow[];
}
