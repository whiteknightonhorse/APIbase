// ---------------------------------------------------------------------------
// Normalized output types
// ---------------------------------------------------------------------------

export interface TidePrediction {
  time: string;
  value: number;
}

export interface TidePredictionsOutput {
  station_id: string;
  station_name: string;
  datum: string;
  units: string;
  total: number;
  predictions: TidePrediction[];
}

export interface WaterLevelReading {
  time: string;
  value: number;
  quality: string;
}

export interface WaterLevelsOutput {
  station_id: string;
  station_name: string;
  datum: string;
  units: string;
  total: number;
  readings: WaterLevelReading[];
}
