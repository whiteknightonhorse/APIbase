/**
 * GeoNet (GNS Science, New Zealand) API response types (UC-649).
 *
 * API host: api.geonet.org.nz
 * Auth: None (public GeoNet Data Policy, CC BY 3.0 NZ)
 *
 * Endpoints:
 *   GET /quake?MMI=(int)     — Quakes felt in the NZ region in the last 365 days (max 100)
 *   GET /quake/(publicID)    — Single quake detail
 *   GET /quake/stats         — Magnitude-count breakdown + daily rate
 *   GET /volcano/val         — Current Volcanic Alert Level for all NZ volcanoes
 */

export interface GeonetQuakeProperties {
  publicID: string;
  time: string;
  depth: number;
  magnitude: number;
  locality: string;
  mmi: number;
  quality: 'best' | 'preliminary' | 'automatic' | 'deleted' | string;
}

export interface GeonetQuakeFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: GeonetQuakeProperties;
}

export interface GeonetQuakeCollection {
  type: 'FeatureCollection';
  features: GeonetQuakeFeature[];
}

export interface GeonetQuakeStats {
  magnitudeCount: {
    days7: Record<string, number>;
    days28: Record<string, number>;
    days365: Record<string, number>;
  };
  rate: {
    perDay: Record<string, number>;
  };
}

export interface GeonetVolcanoAlertProperties {
  volcanoID: string;
  volcanoTitle: string;
  level: number;
  acc: string;
  activity: string;
  hazards: string;
}

export interface GeonetVolcanoAlertFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: GeonetVolcanoAlertProperties;
}

export interface GeonetVolcanoAlertCollection {
  type: 'FeatureCollection';
  features: GeonetVolcanoAlertFeature[];
}
