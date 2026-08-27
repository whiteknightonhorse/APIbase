/**
 * EMSC (European-Mediterranean Seismological Centre) FDSN Event Web Service
 * response types (UC-615).
 *
 * API host: www.seismicportal.eu
 * Auth: None (public real-time seismicity catalog, CC BY 4.0)
 *
 * Endpoint: GET /fdsnws/event/1/query?format=json
 *
 * Response shapes differ by request:
 * - Search (no eventid): FeatureCollection with a `features` array.
 * - Single event (eventid param): a bare Feature object at the top level
 *   (properties directly, no FeatureCollection wrapper).
 * - Zero matches: upstream returns HTTP 204 No Content (empty body), not JSON.
 *   The adapter handles this before JSON parsing is attempted.
 */

export interface EmscEventProperties {
  source_id: string;
  source_catalog: string;
  lastupdate: string;
  time: string;
  flynn_region: string;
  lat: number;
  lon: number;
  depth: number;
  evtype: string;
  auth: string;
  mag: number;
  magtype: string;
  unid: string;
}

export interface EmscFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number, number]; // [lon, lat, depth_km]
  };
  id: string;
  properties: EmscEventProperties;
}

export interface EmscFeatureCollection {
  type: 'FeatureCollection';
  metadata: {
    count: number;
  };
  features: EmscFeature[];
}
