/**
 * postcode.teraren.com types (UC-591).
 * Japan postal code lookup — open data, no auth.
 */

export interface PostcodeJapanEntry {
  postcode_type?: string;
  jis?: string;
  old?: string;
  new?: string;
  prefecture_kana?: string;
  city_kana?: string;
  suburb_kana?: string;
  prefecture?: string;
  city?: string;
  suburb?: string;
  street_address?: string | null;
  office?: string | null;
  office_kana?: string | null;
  office_roman?: string | null;
  post_type?: string | null;
  is_separated_suburb?: number;
  is_koaza?: number;
  is_chome?: number;
  is_include_area?: number;
  status?: number;
  reason?: number;
  prefecture_roman?: string;
  city_roman?: string;
  suburb_roman?: string;
  handling_post_office?: string | null;
  multiple_numbers?: string | null;
  created_at?: string;
  updated_at?: string;
  url?: string;
  location?: {
    latitude: string | null;
    longitude: string | null;
  } | null;
}

export interface PrefectureEntry {
  code: number;
  name: string;
  name_e: string;
  name_h?: string;
  name_k?: string;
  area?: string;
  url?: string;
}

// Normalized outputs

export interface LookupOutput {
  postcode: string;
  prefecture: string;
  prefecture_kana: string;
  prefecture_roman: string;
  city: string;
  city_kana: string;
  city_roman: string;
  suburb: string;
  suburb_kana: string;
  suburb_roman: string;
  street_address: string | null;
  jis_code: string;
  lat: number | null;
  lon: number | null;
  is_chome: boolean;
}

export interface SearchOutput {
  results: Array<{
    postcode: string;
    prefecture: string;
    prefecture_roman: string;
    city: string;
    city_roman: string;
    suburb: string;
    suburb_roman: string;
    lat: number | null;
    lon: number | null;
  }>;
  total: number;
}

export interface PrefecturesOutput {
  prefectures: Array<{
    code: number;
    name: string;
    name_english: string;
    name_hiragana: string;
    name_katakana: string;
    region: string;
  }>;
  total: number;
}
