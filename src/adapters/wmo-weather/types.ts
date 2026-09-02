// WMO World Weather Information Service — raw response types (UC-672)

/** One row of the WMO city directory (`full_city_list.txt`). */
export interface WmoCityInfo {
  country: string;
  city: string;
  cityId: number;
}

export interface WmoForecastDay {
  forecastDate: string;
  wxdesc?: string;
  weather: string;
  minTemp: string | null;
  maxTemp: string | null;
  minTempF: string | null;
  maxTempF: string | null;
  weatherIcon: number;
}

export interface WmoClimateMonth {
  month: number;
  maxTemp: string | null;
  minTemp: string | null;
  meanTemp: string | null;
  maxTempF: string | null;
  minTempF: string | null;
  meanTempF: string | null;
  raindays: string | null;
  rainfall: string | null;
}

export interface WmoMember {
  memId: number;
  memName: string;
  orgName?: string;
  url?: string;
}

/** Response shape of `en/json/{cityId}_en.json`. */
export interface WmoCityResponse {
  city: {
    cityName: string;
    cityLatitude: string;
    cityLongitude: string;
    cityId: number;
    isCapital?: boolean;
    stationName?: string;
    timeZone?: string;
    member?: WmoMember;
    forecast?: {
      issueDate: string;
      timeZone: string;
      forecastDay: WmoForecastDay[];
    };
    climate?: {
      raintype?: string;
      rainunit?: string;
      climatefromclino?: string;
      climateMonth: WmoClimateMonth[];
    };
  };
}
