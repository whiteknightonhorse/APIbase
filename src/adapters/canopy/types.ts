/** Canopy API raw response types (UC-265). */

export interface CanopyPrice {
  symbol: string;
  value: number;
  currency: string;
  display: string;
}

export interface CanopySearchProduct {
  title: string;
  url: string;
  asin: string;
  price: CanopyPrice | null;
  mainImageUrl: string | null;
  rating: number | null;
  ratingsTotal: number | null;
  isPrime: boolean;
  sponsored: boolean;
  coupon: string | null;
}

export interface CanopyProductDetail {
  title: string;
  subtitle: string | null;
  brand: string | null;
  url: string;
  asin: string;
  isPrime: boolean;
  isNew: boolean;
  isInStock: boolean;
  price: CanopyPrice | null;
  mainImageUrl: string | null;
  rating: number | null;
  ratingsTotal: number | null;
  featureBullets: string[];
  coupon: string | null;
  seller: { name: string; id: string } | null;
  categories: { id: string; name: string }[];
}

export interface CanopyOffer {
  price: CanopyPrice;
  conditionIsNew: boolean;
  title: string;
  isPrime: boolean;
  isBuyBoxWinner: boolean;
  seller: {
    name: string;
    id: string;
    rating: number | null;
    ratingsTotal: number | null;
  };
  delivery: {
    fulfilledByAmazon: boolean;
    countdown: string | null;
    comments: string | null;
  } | null;
}

export interface CanopyDeal {
  title: string;
  url: string;
  asin: string;
  price: CanopyPrice | null;
  mainImageUrl: string | null;
  dealId: string;
  dealUrl: string;
  dealPrice: CanopyPrice | null;
}

export interface CanopySearchOutput {
  products: {
    title: string;
    asin: string;
    price: string;
    price_value: number | null;
    currency: string;
    rating: number | null;
    ratings_total: number | null;
    is_prime: boolean;
    url: string;
    image: string;
  }[];
  page: number;
  total_pages: number;
  count: number;
}

export interface CanopyProductOutput {
  title: string;
  brand: string;
  asin: string;
  price: string;
  price_value: number | null;
  currency: string;
  rating: number | null;
  ratings_total: number | null;
  is_prime: boolean;
  in_stock: boolean;
  features: string[];
  categories: string[];
  seller: string;
  url: string;
  image: string;
}

export interface CanopyOffersOutput {
  offers: {
    price: string;
    price_value: number;
    currency: string;
    condition: string;
    is_prime: boolean;
    is_buy_box: boolean;
    seller_name: string;
    seller_rating: number | null;
    fulfilled_by_amazon: boolean;
    delivery: string;
  }[];
  count: number;
}

export interface CanopyDealsOutput {
  deals: {
    title: string;
    asin: string;
    price: string;
    deal_price: string;
    url: string;
    image: string;
  }[];
  page: number;
  total_pages: number;
  count: number;
}
