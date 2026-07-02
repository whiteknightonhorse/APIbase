// snow1g point forecast
export interface SmhiForecastTimeStep {
  time: string;
  intervalParametersStartTime: string;
  data: {
    air_temperature?: number;
    wind_from_direction?: number;
    wind_speed?: number;
    wind_speed_of_gust?: number;
    relative_humidity?: number;
    air_pressure_at_mean_sea_level?: number;
    visibility_in_air?: number;
    thunderstorm_probability?: number;
    probability_of_frozen_precipitation?: number;
    cloud_area_fraction?: number;
    low_type_cloud_area_fraction?: number;
    medium_type_cloud_area_fraction?: number;
    high_type_cloud_area_fraction?: number;
    cloud_base_altitude?: number;
    cloud_top_altitude?: number;
    precipitation_amount_mean?: number;
    precipitation_amount_min?: number;
    precipitation_amount_max?: number;
    precipitation_amount_median?: number;
    probability_of_precipitation?: number;
    symbol_code?: number;
    [key: string]: number | undefined;
  };
}

export interface SmhiForecastResponse {
  createdTime: string;
  referenceTime: string;
  geometry: { type: string; coordinates: number[][] };
  timeSeries: SmhiForecastTimeStep[];
}

// fwif1g fire weather forecast
export interface SmhiFireParameter {
  name: string;
  levelType: string;
  level: number;
  unit: string;
  values: number[];
}

export interface SmhiFireTimeStep {
  validTime: string;
  parameters: SmhiFireParameter[];
}

export interface SmhiFireResponse {
  approvedTime: string;
  referenceTime: string;
  geometry: { type: string; coordinates: number[][] };
  timeSeries: SmhiFireTimeStep[];
}

// ibww warnings
export interface SmhiWarningEvent {
  sv: string;
  en: string;
  code: string;
  mhoClassification: string;
}

export interface SmhiWarningArea {
  id: number;
  approximateStart: string;
  approximateEnd?: string;
  published: string;
  warningLevel: { sv?: string; en: string; code: string };
  eventDescription: { sv?: string; en: string; code: string };
  affectedAreas: { id: number; sv?: string; en: string; type?: string }[];
  descriptions?: { event?: { sv?: string; en?: string } }[];
}

export interface SmhiWarning {
  id: number;
  normalProbability: boolean;
  event: SmhiWarningEvent;
  descriptions: unknown[];
  warningAreas: SmhiWarningArea[];
}

// metobs observations
export interface SmhiObservationValue {
  date: number;
  value: string;
  quality: string;
}

export interface SmhiObservationResponse {
  updated: number;
  parameter: {
    key: string;
    name: string;
    summary: string;
    unit: string;
  };
  station: {
    key: string;
    name: string;
    owner: string;
    latitude: number;
    longitude: number;
    height: number;
    active: boolean;
  };
  period: {
    key: string;
    from: number;
    to: number;
    summary: string;
    sampling: string;
  };
  position: { from: number; to: number; latitude: number; longitude: number; height: number }[];
  value: SmhiObservationValue[];
}
