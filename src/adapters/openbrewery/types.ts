/**
 * Open Brewery DB raw API response types (UC-736).
 * https://www.openbrewerydb.org/documentation
 */

export interface OpenBreweryRecord {
  id: string;
  name: string;
  brewery_type: string;
  address_1: string | null;
  address_2: string | null;
  address_3: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  longitude: number | null;
  latitude: number | null;
  phone: string | null;
  website_url: string | null;
  /** Deprecated by upstream — kept for completeness. */
  state: string | null;
  /** Deprecated by upstream — kept for completeness. */
  street: string | null;
}
