/**
 * Finnhub Stock Market API response types (UC-074).
 *
 * API host: finnhub.io/api/v1
 * Auth: token query parameter
 */

export interface FinnhubQuote {
  c: number;  // Current price
  d: number;  // Change
  dp: number; // Percent change
  h: number;  // High of the day
  l: number;  // Low of the day
  o: number;  // Open of the day
  pc: number; // Previous close
  t: number;  // Timestamp
}

export interface FinnhubCompanyProfile {
  country: string;
  currency: string;
  exchange: string;
  finnhubIndustry: string;
  ipo: string;
  logo: string;
  marketCapitalization: number;
  name: string;
  phone: string;
  shareOutstanding: number;
  ticker: string;
  weburl: string;
}

export interface FinnhubNewsArticle {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

export interface FinnhubCandleResponse {
  s: string;
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  v: number[];
  t: number[];
}
