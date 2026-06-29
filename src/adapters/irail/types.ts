// iRail API v1 response types (UC-524)

export interface IrailStationInfo {
  '@id': string;
  id: string;
  name: string;
  locationX: string;
  locationY: string;
  standardname: string;
}

export interface IrailStationsResponse {
  version: string;
  timestamp: string;
  station: IrailStationInfo[];
}

export interface IrailVehicleInfo {
  name: string;
  shortname: string;
  number: string;
  type: string;
  locationX: string;
  locationY: string;
  '@id': string;
}

export interface IrailPlatformInfo {
  name: string;
  normal: string;
}

export interface IrailOccupancy {
  '@id': string;
  name: string;
}

export interface IrailDeparture {
  id: string;
  station: string;
  stationinfo: IrailStationInfo;
  time: string;
  delay: string;
  canceled: string;
  left: string;
  isExtra: string;
  vehicle: string;
  vehicleinfo: IrailVehicleInfo;
  platform: string;
  platforminfo: IrailPlatformInfo;
  occupancy: IrailOccupancy;
  departureConnection: string;
}

export interface IrailLiveboardResponse {
  version: string;
  timestamp: string;
  station: string;
  stationinfo: IrailStationInfo;
  departures: {
    number: string;
    departure: IrailDeparture[];
  };
}

export interface IrailConnectionDep {
  delay: string;
  station: string;
  stationinfo: IrailStationInfo;
  time: string;
  vehicle: string;
  vehicleinfo: IrailVehicleInfo;
  platform: string;
  platforminfo: IrailPlatformInfo;
  canceled: string;
  direction: { name: string };
  left: string;
  walking: string;
  occupancy?: IrailOccupancy;
}

export interface IrailVia {
  id: string;
  arrival: { delay: string; time: string; platform: string };
  departure: {
    delay: string;
    time: string;
    platform: string;
    vehicle: string;
    direction: { name: string };
  };
  timeBetween: string;
  station: string;
  stationinfo: IrailStationInfo;
  vehicle: string;
  vehicleinfo: IrailVehicleInfo;
}

export interface IrailConnection {
  id: string;
  departure: IrailConnectionDep;
  arrival: IrailConnectionDep;
  duration: string;
  vias?: {
    number: string;
    via: IrailVia[] | IrailVia;
  };
}

export interface IrailConnectionsResponse {
  version: string;
  timestamp: string;
  connection: IrailConnection[];
}

export interface IrailVehicleStop {
  id: string;
  station: string;
  stationinfo: IrailStationInfo;
  time: string;
  platform: string;
  platforminfo: IrailPlatformInfo;
  scheduledDepartureTime: string;
  scheduledArrivalTime: string;
  delay: string;
  canceled: string;
  departureDelay: string;
  departureCanceled: string;
  arrivalDelay: string;
  arrivalCanceled: string;
  left: string;
  arrived: string;
  isExtraStop: string;
  occupancy?: IrailOccupancy;
}

export interface IrailVehicleResponse {
  version: string;
  timestamp: string;
  vehicle: string;
  vehicleinfo: IrailVehicleInfo;
  stops: {
    number: string;
    stop: IrailVehicleStop[];
  };
}

export interface IrailDisturbanceLink {
  id: string;
  link: string;
  text: string;
}

export interface IrailDisturbance {
  id: string;
  title: string;
  description: string;
  type: string;
  link: string;
  timestamp: string;
  richtext?: string;
  descriptionLinks?: {
    number: string;
    descriptionLink: IrailDisturbanceLink[] | IrailDisturbanceLink;
  };
}

export interface IrailDisturbancesResponse {
  version: string;
  timestamp: string;
  disturbance: IrailDisturbance[];
}
