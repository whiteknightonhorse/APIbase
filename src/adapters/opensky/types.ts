/**
 * Raw API response types for OpenSky Network ADS-B API (UC-566).
 * https://opensky-network.org/api
 */

/**
 * State vector as returned by /states/all — positional array from the API.
 * [icao24, callsign, origin_country, time_position, last_contact,
 *  longitude, latitude, baro_altitude, on_ground, velocity,
 *  true_track, vertical_rate, sensors, geo_altitude, squawk, spi, position_source]
 */
export type RawStateVector = [
  string, // 0  icao24
  string | null, // 1  callsign
  string, // 2  origin_country
  number | null, // 3  time_position
  number, // 4  last_contact
  number | null, // 5  longitude
  number | null, // 6  latitude
  number | null, // 7  baro_altitude
  boolean, // 8  on_ground
  number | null, // 9  velocity
  number | null, // 10 true_track
  number | null, // 11 vertical_rate
  number[] | null, // 12 sensors
  number | null, // 13 geo_altitude
  string | null, // 14 squawk
  boolean, // 15 spi
  number, // 16 position_source
];

export interface RawStatesResponse {
  time: number;
  states: RawStateVector[] | null;
}

/** Single waypoint in an aircraft track */
export type RawTrackWaypoint = [
  number, // 0 time (unix)
  number | null, // 1 latitude
  number | null, // 2 longitude
  number | null, // 3 baro_altitude (meters)
  number | null, // 4 true_track
  boolean, // 5 on_ground
];

export interface RawTrackResponse {
  icao24: string;
  callsign: string | null;
  startTime: number;
  endTime: number;
  path: RawTrackWaypoint[];
}
