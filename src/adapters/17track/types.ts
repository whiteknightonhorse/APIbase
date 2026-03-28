/**
 * 17TRACK Package Tracking types (UC-221).
 * API returns JSON with envelope: { code: number, data: { accepted: [], rejected: [] } }
 */

// --- Raw API response shapes ---

export interface Track17Error {
  code: number;
  message: string;
}

export interface Track17RejectedItem {
  number: string;
  error: Track17Error;
}

export interface Track17RegisterAccepted {
  number: string;
  carrier: number;
  origin: number; // 2 = re-registered, 3 = new
}

export interface Track17Address {
  country: string;
  state: string | null;
  city: string | null;
}

export interface Track17Event {
  time_iso: string;
  time_utc: string;
  description: string;
  location: string;
  stage: string;
  sub_status: string | null;
  address: Track17Address;
}

export interface Track17Provider {
  provider: {
    key: number;
    name: string;
    alias: string;
    tel: string;
    homepage: string;
    country: string;
  };
  latest_sync_status: string;
  latest_sync_time: string;
  events: Track17Event[];
}

export interface Track17TrackInfo {
  shipping_info: {
    shipper_address: Track17Address;
    recipient_address: Track17Address;
  };
  latest_status: {
    status: string;
    sub_status: string;
  };
  latest_event: Track17Event | null;
  time_metrics: {
    days_after_order: number | null;
    days_of_transit: number | null;
    days_of_transit_done: number | null;
    days_after_last_update: number | null;
    estimated_delivery_date: {
      from: string | null;
      to: string | null;
    };
  };
  milestone: Array<{
    key_stage: string;
    time_iso: string | null;
  }>;
  tracking: {
    providers: Track17Provider[];
  };
}

export interface Track17TrackAccepted {
  number: string;
  carrier: number;
  tag: string;
  track_info: Track17TrackInfo;
}

export interface Track17ListItem {
  number: string;
  carrier: number;
  register_time: string;
  package_status: string;
  tracking_status: string;
  latest_event_info: string;
  latest_event_time: string;
  days_of_transit: string;
}

export interface Track17ListPage {
  data_total: number;
  page_total: number;
  page_no: number;
  page_size: number;
  has_next: boolean;
  has_prev: boolean;
}

// --- Normalized output shapes ---

export interface TrackingRegisterResult {
  tracking_number: string;
  carrier_code: number | null;
  carrier_name: string | null;
  status: 'registered' | 'already_registered' | 'error';
  is_new: boolean;
  error_message: string | null;
}

export interface TrackingEvent {
  datetime: string;
  location: string;
  description: string;
  stage: string;
}

export interface TrackingStatusResult {
  tracking_number: string;
  carrier_code: number | null;
  carrier_name: string | null;
  status: string;
  latest_event: TrackingEvent | null;
  events: TrackingEvent[];
  milestones: Array<{ stage: string; datetime: string | null }>;
  days_in_transit: number | null;
  origin: string | null;
  destination: string | null;
  error_message: string | null;
}

export interface TrackingListResult {
  items: Array<{
    tracking_number: string;
    carrier_code: number;
    status: string;
    latest_event: string;
    latest_event_time: string;
    days_in_transit: string;
    registered_at: string;
  }>;
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}
