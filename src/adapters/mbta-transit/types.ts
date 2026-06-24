export interface MbtaRoute {
  id: string;
  attributes: {
    color: string;
    description: string;
    direction_destinations: string[];
    direction_names: string[];
    fare_class: string;
    long_name: string;
    short_name: string;
    sort_order: number;
    text_color: string;
    type: number;
  };
}

export interface MbtaStop {
  id: string;
  attributes: {
    address: string | null;
    latitude: number;
    location_type: number;
    longitude: number;
    municipality: string | null;
    name: string;
    platform_code: string | null;
    platform_name: string | null;
    vehicle_type: number | null;
    wheelchair_boarding: number;
  };
}

export interface MbtaAlert {
  id: string;
  attributes: {
    active_period: Array<{ start: string; end: string | null }>;
    cause: string;
    created_at: string;
    description: string | null;
    duration_certainty: string;
    effect: string;
    header: string;
    informed_entity: Array<{
      route?: string;
      stop?: string;
      route_type?: number;
      direction_id?: number;
      activities?: string[];
    }>;
    lifecycle: string;
    service_effect: string;
    severity: number;
    short_header: string;
    updated_at: string;
    url: string | null;
  };
}

export interface MbtaPrediction {
  id: string;
  attributes: {
    arrival_time: string | null;
    departure_time: string | null;
    direction_id: number;
    schedule_relationship: string | null;
    status: string | null;
    stop_sequence: number | null;
  };
  relationships: {
    route?: { data?: { id: string } };
    stop?: { data?: { id: string } };
    trip?: { data?: { id: string } };
    vehicle?: { data?: { id: string } };
  };
}

export interface MbtaListResponse<T> {
  data: T[];
  links?: {
    first?: string;
    last?: string;
    next?: string;
  };
}
