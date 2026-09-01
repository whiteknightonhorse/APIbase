export interface GeoJsonFeature<P> {
  type: 'Feature';
  id?: string | number;
  geometry: { type: string; coordinates: number[] } | null;
  properties: P;
}

export interface GeoJsonFeatureCollection<P> {
  type: 'FeatureCollection';
  features: GeoJsonFeature<P>[];
  numberMatched?: number;
  numberReturned?: number;
}

export interface ClimateStationProperties {
  STATION_NAME: string;
  PROV_STATE_TERR_CODE: string;
  ENG_PROV_NAME: string;
  COUNTRY: string;
  CLIMATE_IDENTIFIER: string;
  WMO_IDENTIFIER: string | null;
  TC_IDENTIFIER: string | null;
  ELEVATION: string;
  FIRST_DATE: string | null;
  LAST_DATE: string | null;
  DLY_FIRST_DATE: string | null;
  DLY_LAST_DATE: string | null;
  HLY_FIRST_DATE: string | null;
  HLY_LAST_DATE: string | null;
  HAS_MONTHLY_SUMMARY: string;
  HAS_NORMALS_DATA: string;
  HAS_HOURLY_DATA: string;
}

export interface ClimateDailyProperties {
  STATION_NAME: string;
  CLIMATE_IDENTIFIER: string;
  PROVINCE_CODE: string;
  LOCAL_DATE: string;
  MEAN_TEMPERATURE: number | null;
  MIN_TEMPERATURE: number | null;
  MAX_TEMPERATURE: number | null;
  TOTAL_PRECIPITATION: number | null;
  TOTAL_RAIN: number | null;
  TOTAL_SNOW: number | null;
  SNOW_ON_GROUND: number | null;
  SPEED_MAX_GUST: number | null;
  DIRECTION_MAX_GUST: number | null;
  HEATING_DEGREE_DAYS: number | null;
  COOLING_DEGREE_DAYS: number | null;
}

export interface HydrometricRealtimeProperties {
  STATION_NUMBER: string;
  STATION_NAME: string;
  PROV_TERR_STATE_LOC: string;
  DATETIME: string;
  DATETIME_LST: string;
  LEVEL: number | null;
  LEVEL_SYMBOL_EN: string | null;
  DISCHARGE: number | null;
  DISCHARGE_SYMBOL_EN: string | null;
}

export interface AqhiObservationProperties {
  id: string;
  aqhi_type: string;
  observation_type: string;
  location_id: string;
  location_name_en: string;
  location_name_fr: string;
  observation_datetime: string;
  observation_datetime_text_en: string;
  aqhi: number | null;
  special_notes_en: string;
  latest: boolean;
}
