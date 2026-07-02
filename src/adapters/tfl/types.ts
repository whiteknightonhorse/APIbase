// Transport for London (TfL) Unified API raw response types (UC-568)

export interface TflLineStatus {
  id: string;
  name: string;
  modeName: string;
  lineStatuses: Array<{
    statusSeverity: number;
    statusSeverityDescription: string;
    reason?: string;
    disruption?: {
      category?: string;
      description?: string;
      affectedStops?: Array<{ id: string; commonName: string }>;
    };
  }>;
}

export interface TflArrival {
  id: string;
  naptanId: string;
  stationName: string;
  lineId: string;
  lineName: string;
  platformName: string;
  direction: string;
  destinationName: string;
  expectedArrival: string;
  timeToStation: number;
  vehicleId?: string;
  currentLocation?: string;
  towards?: string;
}

export interface TflStopPoint {
  naptanId: string;
  commonName: string;
  lat: number;
  lon: number;
  icsCode?: string;
  platformName?: string;
}

export interface TflJourneyLeg {
  duration: number;
  instruction?: {
    summary: string;
    detailed: string;
  };
  mode?: {
    id: string;
    name: string;
  };
  departurePoint: TflStopPoint;
  arrivalPoint: TflStopPoint;
  departureTime: string;
  arrivalTime: string;
  routeOptions?: Array<{
    name?: string;
    directions?: string[];
  }>;
}

export interface TflJourney {
  startDateTime: string;
  arrivalDateTime: string;
  duration: number;
  legs: TflJourneyLeg[];
}

export interface TflJourneyResponse {
  journeys: TflJourney[];
  lines?: Array<{ id: string; name: string }>;
}

export interface TflBikePoint {
  id: string;
  commonName: string;
  lat: number;
  lon: number;
  additionalProperties: Array<{
    key: string;
    value: string;
  }>;
}
