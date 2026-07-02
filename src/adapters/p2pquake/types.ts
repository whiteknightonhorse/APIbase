/**
 * P2PQuake API response types (UC-592).
 *
 * API host: api.p2pquake.net
 * Auth: None (open data, community-operated, MIT-licensed)
 *
 * Endpoints:
 *   GET /v2/jma/quake   — Recent JMA earthquake reports (code 551)
 *   GET /v2/jma/tsunami — Recent JMA tsunami warnings (code 552)
 *   GET /v2/history     — Historical event search (multi-code)
 */

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

export interface P2pHypocenter {
  depth: number; // Depth in km (-1 = unknown)
  latitude: number; // Decimal latitude (-200 = unknown)
  longitude: number; // Decimal longitude (-200 = unknown)
  magnitude: number; // Richter magnitude (-1 = unknown)
  name: string; // Japanese place name of epicenter
  reduceName?: string; // Shorter prefecture name (code 556 only)
}

export interface P2pEarthquakeInfo {
  domesticTsunami: string; // "None" | "Unknown" | "Checking" | "NonEffective" | "Watch" | "Warning"
  foreignTsunami: string; // Same values
  hypocenter: P2pHypocenter;
  maxScale: number; // JMA seismic intensity × 10 (e.g. 40 = shindo 4, 70 = shindo 7, -1 = unknown)
  time: string; // Earthquake occurrence time "YYYY/MM/DD HH:MM:SS"
}

export interface P2pObservationPoint {
  addr: string; // Observation point address (Japanese)
  isArea: boolean; // true = broad area, false = specific point
  pref: string; // Prefecture name (Japanese)
  scale: number; // JMA intensity at this point × 10
}

export interface P2pIssueInfo {
  correct: string; // Correction type: "None" | "Unknown" | "ScaleAndDestination" | "Destination" | "Scale" | "Cancel"
  source: string; // Issuing source (typically "気象庁" = JMA)
  time: string; // Issue time "YYYY/MM/DD HH:MM:SS"
  type: string; // Issue type: "ScalePrompt" | "Destination" | "DetailScale" | "Foreign" | "Other"
  eventId?: string; // Event ID (code 556 only)
  serial?: string; // Serial number (code 556 only)
}

export interface P2pComments {
  freeFormComment: string; // Free-text remarks from JMA
  forecast?: string; // Damage/tsunami forecast text
  var?: string; // Variable remarks
}

export interface P2pTimestamp {
  convert: string; // Converted time
  register: string; // Registration time
}

// ---------------------------------------------------------------------------
// Earthquake report (code 551)
// ---------------------------------------------------------------------------

export interface P2pQuakeEvent {
  code: 551;
  id: string;
  created_at: string;
  time: string;
  timestamp: P2pTimestamp;
  issue: P2pIssueInfo;
  earthquake: P2pEarthquakeInfo;
  points: P2pObservationPoint[];
  comments: P2pComments;
  user_agent: string;
  ver: string;
}

// ---------------------------------------------------------------------------
// Tsunami warning (code 552)
// ---------------------------------------------------------------------------

export interface P2pTsunamiArea {
  grade: string; // Warning grade: "MajorWarning" | "Warning" | "Watch" | "Unknown"
  immediate: boolean; // true = immediate danger
  name: string; // Coastal area name (Japanese)
  firstHeight?: {
    arrivalTime?: string;
    condition?: string; // "Checking" | "Arrived" | "AllClear"
  };
  maxHeight?: {
    description?: string;
    condition?: string;
    value?: number; // Expected height in metres
  };
}

export interface P2pTsunamiEvent {
  code: 552;
  id: string;
  created_at: string;
  time: string;
  timestamp: P2pTimestamp;
  cancelled: boolean;
  issue: {
    source: string;
    time: string;
    type: string; // "Focus" | "FirstReport" | "Update" | "AllClear"
  };
  areas: P2pTsunamiArea[];
  earthquake?: P2pEarthquakeInfo; // Triggering earthquake, if known
  comments?: P2pComments;
  user_agent: string;
  ver: string;
}

// ---------------------------------------------------------------------------
// General history event (union of codes)
// ---------------------------------------------------------------------------

export type P2pHistoryEvent = P2pQuakeEvent | P2pTsunamiEvent | Record<string, unknown>;
