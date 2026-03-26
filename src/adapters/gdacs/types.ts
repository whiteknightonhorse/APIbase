/** GDACS API response types (UC-194). */

export interface GdacsFeatureCollection {
  type: 'FeatureCollection';
  features: GdacsFeature[];
  bbox?: number[];
}

export interface GdacsFeature {
  type: 'Feature';
  bbox?: number[];
  geometry: {
    type: string;
    coordinates: number[];
  };
  properties: GdacsEventProperties;
}

export interface GdacsEventProperties {
  eventtype: string;
  eventid: number;
  episodeid: number;
  eventname: string;
  glide: string;
  name: string;
  description: string;
  htmldescription: string;
  icon: string;
  iconoverall: string;
  url: Record<string, string>;
  alertlevel: string;
  alertscore: number;
  severity: Record<string, unknown>;
  population: Record<string, unknown>;
  vulnerability: Record<string, unknown>;
  country: string;
  fromdate: string;
  todate: string;
  datemodified: string;
  [key: string]: unknown;
}
