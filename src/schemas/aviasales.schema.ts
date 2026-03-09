import { z, type ZodSchema } from 'zod';

const aviasalesSearchFlights = z
  .object({
    origin: z.string(),
    destination: z.string(),
    departure_date: z.string(),
    return_date: z.string().optional(),
    passengers: z
      .object({
        adults: z.number().int().min(1).max(9).optional(),
        children: z.number().int().max(9).optional(),
        infants: z.number().int().max(9).optional(),
      })
      .strip()
      .optional(),
    cabin_class: z.enum(['economy', 'business']).optional(),
    direct_only: z.boolean().optional(),
    currency: z.string().optional(),
    sort_by: z.enum(['price', 'duration', 'departure_time']).optional(),
    limit: z.number().int().max(50).optional(),
  })
  .strip();

const aviasalesPriceCalendar = z
  .object({
    origin: z.string(),
    destination: z.string(),
    month: z.string(),
    currency: z.string().optional(),
  })
  .strip();

const aviasalesCheapFlights = z
  .object({
    origin: z.string(),
    destination: z.string().optional(),
    departure_month: z.string().optional(),
    direct_only: z.boolean().optional(),
    currency: z.string().optional(),
    limit: z.number().int().max(30).optional(),
  })
  .strip();

const aviasalesPopularRoutes = z
  .object({
    origin: z.string(),
    limit: z.number().int().max(30).optional(),
  })
  .strip();

const aviasalesHotelSearch = z
  .object({
    city: z.string(),
    check_in: z.string(),
    check_out: z.string(),
    guests: z
      .object({
        adults: z.number().int().optional(),
        children: z.number().int().optional(),
      })
      .strip()
      .optional(),
    stars: z.array(z.number().int().min(1).max(5)).optional(),
    sort_by: z.enum(['price', 'rating', 'stars', 'popularity']).optional(),
    price_max_usd: z.number().optional(),
    limit: z.number().int().max(50).optional(),
  })
  .strip();

const aviasalesNearbyDestinations = z
  .object({
    origin: z.string(),
    destination: z.string(),
    departure_date: z.string(),
    return_date: z.string().optional(),
    flexibility_days: z.number().int().optional(),
    distance_km: z.number().int().optional(),
    currency: z.string().optional(),
  })
  .strip();

const aviasalesAirportLookup = z
  .object({
    query: z.string(),
    locale: z.string().optional(),
  })
  .strip();

export const aviasalesSchemas: Record<string, ZodSchema> = {
  'aviasales.search_flights': aviasalesSearchFlights,
  'aviasales.price_calendar': aviasalesPriceCalendar,
  'aviasales.cheap_flights': aviasalesCheapFlights,
  'aviasales.popular_routes': aviasalesPopularRoutes,
  'aviasales.hotel_search': aviasalesHotelSearch,
  'aviasales.nearby_destinations': aviasalesNearbyDestinations,
  'aviasales.airport_lookup': aviasalesAirportLookup,
};
