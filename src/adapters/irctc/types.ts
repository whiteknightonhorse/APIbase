/** IRCTC Indian Railways API raw response types (UC-426). */

/** Raw train object from trainBetweenStations endpoint. */
export interface IrctcTrain {
  train_number: string;
  train_name: string;
  from_station_name?: string;
  to_station_name?: string;
  from_std?: string;
  to_std?: string;
  from_sta?: string;
  to_sta?: string;
  travel_time?: string;
  distance?: string | number;
  classes?: string[];
  run_days?: Record<string, boolean | string>;
  train_type?: string;
}

/** Raw station object from searchStation endpoint. */
export interface IrctcStation {
  station_code: string;
  station_name: string;
  state?: string;
  city?: string;
}

/** Raw station entry from liveTrainStatus endpoint. */
export interface IrctcStatusStation {
  station_code?: string;
  station_name?: string;
  scheduled_arrival?: string;
  actual_arrival?: string;
  scheduled_departure?: string;
  actual_departure?: string;
  delay_arrival?: number;
  delay_departure?: number;
  distance?: number;
  is_current?: boolean;
  halt?: number;
}

/** Raw response for trainBetweenStations. */
export interface IrctcTrainBetweenStationsResponse {
  status?: boolean;
  message?: string;
  data?: IrctcTrain[];
}

/** Raw response for liveTrainStatus. */
export interface IrctcLiveStatusResponse {
  status?: boolean;
  message?: string;
  data?: {
    train_number?: string;
    train_name?: string;
    current_station_code?: string;
    current_station_name?: string;
    delay?: number;
    position?: string;
    journey_date?: string;
    start_station?: string;
    end_station?: string;
    stations?: IrctcStatusStation[];
  };
}

/** Raw response for searchStation. */
export interface IrctcStationSearchResponse {
  status?: boolean;
  message?: string;
  data?: IrctcStation[];
}

/** Parsed output for irctc.train_search. */
export interface IrctcTrainSearchOutput {
  trains: {
    train_number: string;
    train_name: string;
    departure: string;
    arrival: string;
    distance: string;
    classes: string[];
    run_days: Record<string, boolean | string>;
    train_type: string;
  }[];
  count: number;
  from_station: string;
  to_station: string;
  date: string;
}

/** Parsed output for irctc.train_status. */
export interface IrctcTrainStatusOutput {
  train_number: string;
  train_name: string;
  current_station: string;
  delay_minutes: number;
  position: string;
  journey_date: string;
  stations: {
    code: string;
    name: string;
    scheduled_arrival: string;
    actual_arrival: string;
    scheduled_departure: string;
    actual_departure: string;
    delay_minutes: number;
    distance_km: number;
    is_current: boolean;
  }[];
}

/** Parsed output for irctc.station_search. */
export interface IrctcStationSearchOutput {
  stations: {
    code: string;
    name: string;
    state: string;
    city: string;
  }[];
  count: number;
  query: string;
}
