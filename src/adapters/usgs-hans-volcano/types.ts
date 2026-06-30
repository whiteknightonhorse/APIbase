/**
 * USGS HANS (Hazard Notification System) Volcano API response types (UC-556).
 *
 * API host: volcanoes.usgs.gov/hans-public/api/volcano
 * Auth: None (US Government open data, public domain)
 *
 * Endpoints:
 *   /getMonitoredVolcanoes          — all actively monitored US volcanoes
 *   /getElevatedVolcanoes           — volcanoes at elevated alert (yellow/orange/red)
 *   /getCapElevated                 — CAP alerts for highly elevated volcanoes
 *   /getUSVolcanoes                 — full catalog of all US volcanoes
 *   /getVolcano/{id}                — single volcano detail
 *   /newestForVolcano/{id}          — newest notice for a volcano
 */

// ---------------------------------------------------------------------------
// Monitored / Elevated volcano entry
// ---------------------------------------------------------------------------

export interface MonitoredVolcano {
  volcano_name: string;
  vnum: string;
  sent_utc: string;
  sent_unixtime: number;
  alert_level: string;
  color_code: string;
  volcano_cd: string;
  obs_fullname: string;
  obs_abbr: string;
  notice_type_cd: string;
  notice_identifier: string;
  notice_url: string;
  notice_data: string;
}

// ---------------------------------------------------------------------------
// CAP (Common Alerting Protocol) elevated entry
// ---------------------------------------------------------------------------

export interface CapElevatedVolcano {
  volcano_name_appended: string;
  latitude: number;
  longitude: number;
  vnum: string;
  elevation_meters: number;
  elevation_feet: number;
  obs_fullname: string;
  alert_level: string;
  color_code: string;
  cap_certainty: string;
  cap_severity: string;
  cap_urgency: string;
  is_elevated_cap: boolean;
  prev_is_elevated_cap: boolean;
  notice_identifier: string;
  pubDate: string;
  sent_date_cap: string;
  prev_sent_date_cap: string | null;
  cap_expires: string;
  mail_subject: string;
  author: string;
  synopsis: string | null;
  guid: string;
  prev_guid: string | null;
  msgType: string;
  noticeTypeCd: string;
  notice_url: string;
  prev_notice_url: string | null;
  notice_data: string;
}

// ---------------------------------------------------------------------------
// US volcano catalog entry
// ---------------------------------------------------------------------------

export interface UsVolcano {
  obs_abbr: string;
  obs_fullname: string;
  obs_email: string;
  volcano_cd: string;
  vnum: string;
  volcano_name: string;
  region: string;
  latitude: number;
  longitude: number;
  elevation_meters: number;
  boilerplate: string;
  volcano_url: string;
  volcano_image_url: string;
  nvews_threat: string;
  icao_coordinates: string;
}

// ---------------------------------------------------------------------------
// Single volcano detail
// ---------------------------------------------------------------------------

export interface VolcanoDetail {
  volcano_name: string;
  vnum: string;
  obs_abbr: string;
  obs_fullname: string;
  volcano_cd: string;
  region: string;
  latitude: number;
  longitude: number;
  elevation_meters: number;
  boilerplate: string;
  volcano_url: string;
  volcano_image_url: string;
  nvews_threat: string;
  icao_coordinates: string;
  hans_url?: string;
  hans_data_url?: string;
  newest_notice_url?: string;
}

// ---------------------------------------------------------------------------
// Newest notice (HTML + metadata)
// ---------------------------------------------------------------------------

export interface NewestNotice {
  noticeHtml: string;
}
