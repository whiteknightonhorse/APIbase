import { z, type ZodSchema } from 'zod';

const amadeusFlightSearch = z
  .object({
    origin: z.string().length(3).describe('Origin airport IATA code (e.g. JFK, LAX)'),
    destination: z.string().length(3).describe('Destination airport IATA code (e.g. CDG, LHR)'),
    departure_date: z.string().describe('Departure date in YYYY-MM-DD format'),
    return_date: z.string().optional().describe('Return date in YYYY-MM-DD format for round trips'),
    adults: z.number().int().min(1).max(9).optional().default(1).describe('Number of adult passengers (1-9)'),
    travel_class: z
      .enum(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'])
      .optional()
      .default('ECONOMY')
      .describe('Cabin class'),
    nonstop: z.boolean().optional().default(false).describe('Only return non-stop flights'),
    max_results: z.number().int().min(1).max(50).optional().default(10).describe('Max number of flight offers (1-50)'),
    currency: z.string().length(3).optional().default('USD').describe('Price currency ISO code (e.g. USD, EUR)'),
  })
  .strip();

const amadeusFlightPrice = z
  .object({
    flight_offer: z.record(z.unknown()).describe('Flight offer object from flight_search results'),
  })
  .strip();

const amadeusFlightStatus = z
  .object({
    carrier_code: z.string().min(2).max(3).describe('Airline IATA or ICAO code (e.g. AA, UAL)'),
    flight_number: z.string().min(1).max(5).describe('Flight number (e.g. 100, 1234)'),
    date: z.string().describe('Flight date in YYYY-MM-DD format'),
  })
  .strip();

const amadeusAirportSearch = z
  .object({
    keyword: z.string().min(1).max(100).describe('Airport or city name to search (e.g. London, JFK)'),
    subType: z.enum(['AIRPORT', 'CITY']).optional().describe('Filter by location type'),
  })
  .strip();

const amadeusAirportNearest = z
  .object({
    latitude: z.number().min(-90).max(90).describe('Latitude in decimal degrees (-90 to 90)'),
    longitude: z.number().min(-180).max(180).describe('Longitude in decimal degrees (-180 to 180)'),
    radius: z.number().int().min(1).max(500).optional().default(500).describe('Search radius in km (1-500)'),
  })
  .strip();

const amadeusAirportRoutes = z
  .object({
    airport_code: z.string().length(3).describe('Airport IATA code (e.g. JFK, LAX)'),
  })
  .strip();

const amadeusAirlineLookup = z
  .object({
    airline_code: z.string().min(2).max(3).describe('Airline IATA (2-char) or ICAO (3-char) code'),
  })
  .strip();

export const amadeusSchemas: Record<string, ZodSchema> = {
  'amadeus.flight_search': amadeusFlightSearch,
  'amadeus.flight_price': amadeusFlightPrice,
  'amadeus.flight_status': amadeusFlightStatus,
  'amadeus.airport_search': amadeusAirportSearch,
  'amadeus.airport_nearest': amadeusAirportNearest,
  'amadeus.airport_routes': amadeusAirportRoutes,
  'amadeus.airline_lookup': amadeusAirlineLookup,
};
