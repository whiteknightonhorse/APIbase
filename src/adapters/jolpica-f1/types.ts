export interface F1Circuit {
  circuitId: string;
  url: string;
  circuitName: string;
  Location: {
    lat: string;
    long: string;
    locality: string;
    country: string;
  };
}

export interface F1Race {
  season: string;
  round: string;
  url: string;
  raceName: string;
  Circuit: F1Circuit;
  date: string;
  time?: string;
  FirstPractice?: { date: string; time: string };
  SecondPractice?: { date: string; time: string };
  ThirdPractice?: { date: string; time: string };
  Qualifying?: { date: string; time: string };
  Sprint?: { date: string; time: string };
}

export interface F1Driver {
  driverId: string;
  permanentNumber?: string;
  code?: string;
  url: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  nationality: string;
}

export interface F1Constructor {
  constructorId: string;
  url: string;
  name: string;
  nationality: string;
}

export interface F1RaceResult {
  number: string;
  position: string;
  positionText: string;
  points: string;
  Driver: F1Driver;
  Constructor: F1Constructor;
  grid: string;
  laps: string;
  status: string;
  Time?: { millis?: string; time: string };
  FastestLap?: {
    rank: string;
    lap: string;
    Time: { time: string };
    AverageSpeed?: { units: string; speed: string };
  };
}

export interface F1DriverStanding {
  position: string;
  positionText: string;
  points: string;
  wins: string;
  Driver: F1Driver;
  Constructors: F1Constructor[];
}

export interface F1ConstructorStanding {
  position: string;
  positionText: string;
  points: string;
  wins: string;
  Constructor: F1Constructor;
}
