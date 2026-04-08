// ---------------------------------------------------------------------------
// Normalized output types
// ---------------------------------------------------------------------------

export interface IssPositionOutput {
  latitude: number;
  longitude: number;
  altitude_km: number;
  velocity_kmh: number;
  visibility: string;
  timestamp: number;
}

export interface IssTleOutput {
  satellite_id: number;
  name: string;
  line1: string;
  line2: string;
  requested_timestamp: number;
}
