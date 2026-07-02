// NOAA CO-OPS Tides & Currents API raw response types (UC-567)

export interface CoopsDataRecord {
  t: string;
  v: string;
  s?: string;
  f?: string;
  q?: string;
  type?: string;
}

export interface CoopsMetadata {
  id: string;
  name: string;
  lat: string;
  lon: string;
}

export interface CoopsDataResponse {
  metadata?: CoopsMetadata;
  data?: CoopsDataRecord[];
  predictions?: CoopsDataRecord[];
  error?: { message: string };
}

export interface CoopsRawStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  state?: string;
  tidal: boolean;
  greatlakes: boolean;
  timezone?: string;
  forecast?: boolean;
}

export interface CoopsStationsResponse {
  stations: CoopsRawStation[];
}
