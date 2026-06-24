export interface ElevationLocation {
  lat: number;
  lng: number;
}

export interface ElevationResult {
  dataset: string;
  elevation: number | null;
  location: ElevationLocation;
}

export interface ElevationResponse {
  status: 'OK' | 'INVALID_REQUEST';
  results: ElevationResult[];
  error?: string;
}
