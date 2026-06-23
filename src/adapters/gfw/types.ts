// ---------------------------------------------------------------------------
// Global Fishing Watch API raw response types (UC-497)
// ---------------------------------------------------------------------------

// --- Vessel identity ---

export interface GfwVesselSelfReported {
  id: string;
  ssvid: string;
  shipname: string;
  nShipname: string;
  flag: string;
  callsign: string | null;
  imo: string | null;
  messagesCounter: number;
  positionsCounter: number;
  sourceCode: string[];
  matchFields: string;
  transmissionDateFrom: string;
  transmissionDateTo: string;
}

export interface GfwGeartype {
  name: string;
  source: string;
  yearFrom: number;
  yearTo: number;
}

export interface GfwShiptype {
  name: string;
  source: string;
  yearFrom: number;
  yearTo: number;
}

export interface GfwCombinedSourcesInfo {
  vesselId: string;
  geartypes: GfwGeartype[];
  shiptypes: GfwShiptype[];
}

export interface GfwRegistryInfo {
  id?: string;
  ssvid?: string;
  flag?: string;
  shipname?: string;
  imo?: string | null;
  callsign?: string | null;
  registrySource?: string;
}

export interface GfwVesselEntry {
  dataset: string;
  registryInfoTotalRecords: number;
  registryInfo: GfwRegistryInfo[];
  registryOwners: unknown[];
  combinedSourcesInfo: GfwCombinedSourcesInfo[];
  selfReportedInfo: GfwVesselSelfReported[];
}

export interface GfwVesselSearchResponse {
  limit: number;
  since?: string;
  total: number;
  entries: GfwVesselEntry[];
  metadata?: {
    query?: string;
    normalizedQuery?: string;
    didYouMean?: Record<string, string>;
  };
}

export interface GfwVesselDetailResponse {
  registryInfoTotalRecords: number;
  registryInfo: GfwRegistryInfo[];
  registryOwners: unknown[];
  registryPublicAuthorizations: unknown[];
  combinedSourcesInfo: GfwCombinedSourcesInfo[];
  selfReportedInfo: GfwVesselSelfReported[];
  dataset: string;
}

// --- Events ---

export interface GfwEventRegions {
  mpa: string[];
  eez: string[];
  rfmo: string[];
  fao: string[];
  majorFao: string[];
  eez12Nm: string[];
  highSeas: string[];
}

export interface GfwEventDistances {
  startDistanceFromShoreKm: number;
  endDistanceFromShoreKm: number;
  startDistanceFromPortKm: number;
  endDistanceFromPortKm: number;
}

export interface GfwEventVessel {
  id: string;
  name: string;
  ssvid: string;
  flag?: string;
}

export interface GfwEventEntry {
  id: string;
  type: string;
  start: string;
  end: string;
  position: { lat: number; lon: number };
  regions: GfwEventRegions;
  boundingBox: number[];
  distances?: GfwEventDistances;
  vessel?: GfwEventVessel;
  port?: { name?: string; flag?: string };
}

export interface GfwEventsResponse {
  metadata: {
    datasets: string[];
    vessels: string[];
    dateRange: { from: string | null; to: string | null };
  };
  limit: number;
  offset: number;
  nextOffset: number | null;
  total: number;
  entries: GfwEventEntry[];
}

// --- Fishing effort ---

export interface GfwEffortCell {
  date: string;
  geartype: string;
  hours: number;
  lat: number;
  lon: number;
  vesselIDs: number;
}

export interface GfwEffortEntry {
  [dataset: string]: GfwEffortCell[];
}

export interface GfwEffortResponse {
  total: number;
  limit: number | null;
  offset: number | null;
  nextOffset: number | null;
  metadata: Record<string, unknown>;
  entries: GfwEffortEntry[];
}

// --- Normalized output ---

export interface GfwVesselNormalized {
  vessel_id: string;
  name: string;
  flag: string;
  ssvid: string;
  imo: string | null;
  callsign: string | null;
  ship_types: string[];
  gear_types: string[];
  transmission_from: string;
  transmission_to: string;
  source_datasets: string[];
}

export interface GfwVesselSearchOutput {
  total: number;
  vessels: GfwVesselNormalized[];
}

export interface GfwVesselDetailOutput extends GfwVesselNormalized {
  registry_records: number;
}

export interface GfwEventNormalized {
  id: string;
  type: string;
  start: string;
  end: string;
  lat: number;
  lon: number;
  eez_ids: string[];
  rfmo_ids: string[];
  fao_areas: string[];
  distance_from_shore_km: number;
  distance_from_port_km: number;
  port_name: string | null;
  port_flag: string | null;
}

export interface GfwFishingEventsOutput {
  vessel_id: string;
  total: number;
  offset: number;
  next_offset: number | null;
  events: GfwEventNormalized[];
}

export interface GfwEffortCellNormalized {
  date: string;
  gear_type: string;
  fishing_hours: number;
  vessel_count: number;
  lat: number;
  lon: number;
}

export interface GfwFishingEffortOutput {
  total_cells: number;
  date_range: string;
  gear_types: string[];
  cells: GfwEffortCellNormalized[];
}
