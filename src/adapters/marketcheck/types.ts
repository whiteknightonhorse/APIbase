/**
 * MarketCheck Car Listings types (UC-231).
 * US vehicle listings from millions of active marketplace listings.
 */

export interface MCListing {
  id: string;
  vin: string;
  heading: string;
  price: number;
  miles: number;
  msrp: number;
  exterior_color: string;
  interior_color: string;
  dom: number;
  dom_180: number;
  dom_active: number;
  seller_type: string;
  inventory_type: string;
  stock_no: string;
  vdp_url: string;
  carfax_1_owner: boolean;
  carfax_clean_title: boolean;
  last_seen_at: string;
  first_seen_at: string;
  dealer: {
    id: number;
    name: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    dealer_type: string;
  };
  build: {
    year: number;
    make: string;
    model: string;
    trim: string;
    body_type: string;
    drivetrain: string;
    transmission: string;
    engine: string;
    fuel_type: string;
    doors: number;
    cylinders: number;
  };
  media: {
    photo_links: string[];
  };
}

export interface MCSearchResponse {
  num_found: number;
  listings: MCListing[];
}

// Normalized outputs

export interface CarSearchOutput {
  total: number;
  listings: Array<{
    id: string;
    vin: string;
    heading: string;
    price: number;
    miles: number;
    year: number;
    make: string;
    model: string;
    trim: string;
    exterior_color: string;
    seller_type: string;
    dealer_name: string;
    dealer_city: string;
    dealer_state: string;
    listing_url: string;
    days_on_market: number;
    carfax_clean_title: boolean;
  }>;
}

export interface CarListingOutput {
  id: string;
  vin: string;
  heading: string;
  price: number;
  msrp: number;
  miles: number;
  year: number;
  make: string;
  model: string;
  trim: string;
  body_type: string;
  drivetrain: string;
  transmission: string;
  engine: string;
  fuel_type: string;
  exterior_color: string;
  interior_color: string;
  doors: number;
  seller_type: string;
  dealer_name: string;
  dealer_city: string;
  dealer_state: string;
  dealer_phone: string;
  listing_url: string;
  days_on_market: number;
  carfax_1_owner: boolean;
  carfax_clean_title: boolean;
  photos: string[];
}
