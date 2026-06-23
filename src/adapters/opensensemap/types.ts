export interface OpenSenseMapLocation {
  coordinates: [number, number]; // [longitude, latitude]
  type: string;
  timestamp: string;
}

export interface OpenSenseMapLastMeasurement {
  value: string;
  createdAt: string;
}

export interface OpenSenseMapSensor {
  _id: string;
  title: string;
  unit: string;
  sensorType: string;
  boxes_id?: string;
  icon?: string;
  lastMeasurement?: OpenSenseMapLastMeasurement | null;
}

export interface OpenSenseMapBox {
  _id: string;
  name: string;
  currentLocation: OpenSenseMapLocation;
  exposure?: string;
  model?: string;
  grouptag?: string[];
  createdAt?: string;
  updatedAt?: string;
  lastMeasurementAt?: string;
  sensors?: OpenSenseMapSensor[];
}

export interface OpenSenseMapMeasurement {
  createdAt: string;
  value: string;
  location?: [number, number];
}
