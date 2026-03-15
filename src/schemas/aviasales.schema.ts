import { z, type ZodSchema } from 'zod';

const aviasalesSearchFlights = z
  .object({
    origin: z.string().describe('Origin airport IATA code (e.g. JFK, LAX)'),
    destination: z.string().describe('Destination airport IATA code (e.g. CDG, LHR)'),
    departure_date: z.string().describe('Departure date in YYYY-MM-DD format'),
    return_date: z.string().optional().describe('Return date in YYYY-MM-DD format for round trips'),
    passengers: z
      .object({
        adults: z.number().int().min(1).max(9).optional().describe('Number of adult passengers (1-9)'),
        children: z.number().int().max(9).optional().describe('Number of child passengers (0-9)'),
        infants: z.number().int().max(9).optional().describe('Number of infant passengers (0-9)'),
      })
      .strip()
      .optional()
      .describe('Passenger counts by type'),
    cabin_class: z.enum(['economy', 'business']).optional().describe('Cabin class: economy or business (default economy)'),
    direct_only: z.boolean().optional().describe('Only return direct (non-stop) flights'),
    currency: z.string().optional().describe('Price currency ISO code (e.g. USD, EUR)'),
    sort_by: z.enum(['price', 'duration', 'departure_time']).optional().describe('Sort order for results'),
    limit: z.number().int().max(50).optional().describe('Max number of results (1-50)'),
  })
  .strip();

const aviasalesPriceCalendar = z
  .object({
    origin: z.string().describe('Origin airport IATA code (e.g. JFK, LAX)'),
    destination: z.string().describe('Destination airport IATA code (e.g. CDG, LHR)'),
    month: z.string().describe('Month in YYYY-MM format'),
    currency: z.string().optional().describe('Price currency ISO code (e.g. USD, EUR)'),
  })
  .strip();

const aviasalesCheapFlights = z
  .object({
    origin: z.string().describe('Origin airport IATA code (e.g. JFK, LAX)'),
    destination: z.string().optional().describe('Destination airport IATA code (optional, searches all destinations if omitted)'),
    departure_month: z.string().optional().describe('Filter by departure month in YYYY-MM format'),
    direct_only: z.boolean().optional().describe('Only return direct flights'),
    currency: z.string().optional().describe('Price currency ISO code (e.g. USD, EUR)'),
    limit: z.number().int().max(30).optional().describe('Max number of results (1-30)'),
  })
  .strip();

const aviasalesPopularRoutes = z
  .object({
    origin: z.string().describe('Origin airport IATA code (e.g. JFK, LAX)'),
    limit: z.number().int().max(30).optional().describe('Max number of results (1-30)'),
  })
  .strip();

const aviasalesHotelSearch = z
  .object({
    city: z.string().describe('City name or IATA code for hotel search'),
    check_in: z.string().describe('Check-in date in YYYY-MM-DD format'),
    check_out: z.string().describe('Check-out date in YYYY-MM-DD format'),
    guests: z
      .object({
        adults: z.number().int().optional().describe('Number of adult guests'),
        children: z.number().int().optional().describe('Number of child guests'),
      })
      .strip()
      .optional()
      .describe('Guest counts by type (adults, children)'),
    stars: z.array(z.number().int().min(1).max(5).describe('Star rating (1-5)')).optional().describe('Filter by hotel star ratings'),
    sort_by: z.enum(['price', 'rating', 'stars', 'popularity']).optional().describe('Sort order for results'),
    price_max_usd: z.number().optional().describe('Maximum price per night in USD'),
    limit: z.number().int().max(50).optional().describe('Max number of results (1-50)'),
  })
  .strip();

const aviasalesNearbyDestinations = z
  .object({
    origin: z.string().describe('Origin airport IATA code (e.g. JFK, LAX)'),
    destination: z.string().describe('Destination airport IATA code (e.g. CDG, LHR)'),
    departure_date: z.string().describe('Departure date in YYYY-MM-DD format'),
    return_date: z.string().optional().describe('Return date in YYYY-MM-DD format'),
    flexibility_days: z.number().int().optional().describe('Date flexibility in days (+/-)'),
    distance_km: z.number().int().optional().describe('Max distance from destination in km'),
    currency: z.string().optional().describe('Price currency ISO code (e.g. USD, EUR)'),
  })
  .strip();

const aviasalesAirportLookup = z
  .object({
    query: z.string().describe('Airport name, city, or IATA code to search'),
    locale: z.string().optional().describe('Response locale (e.g. en, de, fr)'),
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
