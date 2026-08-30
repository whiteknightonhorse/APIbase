// Raw response shape for the Malaria Atlas Project (MAP) public GeoServer WFS API
// (data.malariaatlas.org/geoserver/ows). Every GetFeature request returns a standard GeoJSON
// FeatureCollection; `properties` shape varies per feature type (layer).

export interface MalariaAtlasFeature {
  type: 'Feature';
  id: string;
  geometry: unknown;
  properties: Record<string, string | number | boolean | null>;
  bbox?: [number, number, number, number];
}

export interface MalariaAtlasFeatureCollection {
  type: 'FeatureCollection';
  features: MalariaAtlasFeature[];
  totalFeatures: number;
  numberMatched: number;
  numberReturned: number;
}
