// Overpass API — raw JSON response types
// https://overpass-api.de/api/interpreter (OpenStreetMap query engine)

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  // node fields
  lat?: number;
  lon?: number;
  // way/relation centroid (when out center; is used)
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  version: number;
  generator: string;
  osm3s?: {
    timestamp_osm_base?: string;
    copyright?: string;
  };
  elements: OverpassElement[];
}
