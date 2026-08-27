/** Normalized response shapes for GEBCO tools (UC-623). */

export interface GebcoElevationPoint {
  lat: number;
  lon: number;
  elevation_meters: number | null;
}

export interface GebcoElevationPointResult extends GebcoElevationPoint {
  surface: string;
  unit: 'meters';
  note: string;
}

export interface GebcoElevationProfileResult {
  surface: string;
  unit: 'meters';
  note: string;
  count: number;
  points: GebcoElevationPoint[];
}
