/**
 * DHL Shipment Tracking types (UC-228).
 * Official DHL Unified Tracking — 220+ countries.
 */

export interface DHLEvent {
  timestamp: string;
  location: {
    address: {
      addressLocality: string;
      countryCode: string;
    };
  };
  statusCode: string;
  status: string;
  description: string;
}

export interface DHLShipment {
  id: string;
  service: string;
  origin: {
    address: {
      addressLocality: string;
      countryCode: string;
    };
  };
  destination: {
    address: {
      addressLocality: string;
      countryCode: string;
    };
  };
  status: {
    timestamp: string;
    location: {
      address: {
        addressLocality: string;
        countryCode: string;
      };
    };
    statusCode: string;
    status: string;
    description: string;
  };
  events: DHLEvent[];
  estimatedTimeOfDelivery: string | null;
}

export interface DHLResponse {
  shipments: DHLShipment[];
}

// Normalized output

export interface DHLTrackOutput {
  tracking_number: string;
  service: string;
  status: string;
  status_code: string;
  status_description: string;
  origin: string;
  destination: string;
  estimated_delivery: string | null;
  events: Array<{
    datetime: string;
    location: string;
    status: string;
    description: string;
  }>;
  events_count: number;
  found: boolean;
}
