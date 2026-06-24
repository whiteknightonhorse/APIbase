export interface FrankfurterRatesResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

export interface FrankfurterSeriesResponse {
  amount: number;
  base: string;
  start_date: string;
  end_date: string;
  rates: Record<string, Record<string, number>>;
}

export type FrankfurterCurrenciesResponse = Record<string, string>;
