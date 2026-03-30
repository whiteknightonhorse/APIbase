/**
 * ShipEngine types (UC-246).
 * Multi-carrier shipping rates + address validation.
 */

export interface SEAddress {
  address_line1: string;
  address_line2: string;
  city_locality: string;
  state_province: string;
  postal_code: string;
  country_code: string;
}

export interface SEValidationResult {
  status: string;
  original_address: SEAddress;
  matched_address: SEAddress;
  messages: Array<{ code: string; message: string; type: string }>;
}

export interface SERate {
  carrier_friendly_name: string;
  service_type: string;
  service_code: string;
  shipping_amount: { amount: number; currency: string };
  insurance_amount: { amount: number; currency: string };
  confirmation_amount: { amount: number; currency: string };
  other_amount: { amount: number; currency: string };
  delivery_days: number | null;
  estimated_delivery_date: string | null;
  carrier_delivery_days: string | null;
  package_type: string | null;
}

export interface SECarrier {
  carrier_id: string;
  carrier_code: string;
  friendly_name: string;
  nickname: string;
  account_number: string;
}

// Normalized outputs

export interface ValidateOutput {
  status: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  messages: Array<{ code: string; message: string }>;
}

export interface RatesOutput {
  rates: Array<{
    carrier: string;
    service: string;
    price_usd: number;
    delivery_days: number | null;
    estimated_delivery: string | null;
  }>;
  total: number;
}

export interface CarriersOutput {
  carriers: Array<{
    id: string;
    name: string;
    code: string;
  }>;
  total: number;
}
