export interface AdsbdbAircraft {
  type: string | null;
  icao_type: string | null;
  manufacturer: string | null;
  mode_s: string;
  registration: string;
  registered_owner_country_iso_name: string | null;
  registered_owner_country_name: string | null;
  registered_owner_operator_flag_code: string | null;
  registered_owner: string | null;
  url_photo: string | null;
  url_photo_thumbnail: string | null;
}

export interface AdsbdbAircraftResponse {
  response: {
    aircraft: AdsbdbAircraft | null;
  };
}

export interface AdsbdbAirline {
  name: string;
  icao: string;
  iata: string | null;
  country: string | null;
  country_iso: string | null;
  callsign: string | null;
}

export interface AdsbdbAirlineResponse {
  response: AdsbdbAirline[];
}

export interface AdsbdbAirport {
  country_iso_name: string | null;
  country_name: string | null;
  elevation: number | null;
  iata_code: string | null;
  icao_code: string | null;
  latitude: number | null;
  longitude: number | null;
  municipality: string | null;
  name: string | null;
}

export interface AdsbdbCallsignResponse {
  response: {
    flightroute: {
      callsign: string;
      callsign_icao: string | null;
      callsign_iata: string | null;
      airline: AdsbdbAirline | null;
      origin: AdsbdbAirport | null;
      destination: AdsbdbAirport | null;
    } | null;
  };
}
