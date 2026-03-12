import { z, type ZodSchema } from 'zod';

const amadeusFlightSearch = z
  .object({
    origin: z.string().length(3),
    destination: z.string().length(3),
    departure_date: z.string(),
    return_date: z.string().optional(),
    adults: z.number().int().min(1).max(9).optional().default(1),
    travel_class: z
      .enum(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'])
      .optional()
      .default('ECONOMY'),
    nonstop: z.boolean().optional().default(false),
    max_results: z.number().int().min(1).max(50).optional().default(10),
    currency: z.string().length(3).optional().default('USD'),
  })
  .strip();

const amadeusFlightPrice = z
  .object({
    flight_offer: z.record(z.unknown()),
  })
  .strip();

const amadeusFlightStatus = z
  .object({
    carrier_code: z.string().min(2).max(3),
    flight_number: z.string().min(1).max(5),
    date: z.string(),
  })
  .strip();

const amadeusAirportSearch = z
  .object({
    keyword: z.string().min(1).max(100),
    subType: z.enum(['AIRPORT', 'CITY']).optional(),
  })
  .strip();

const amadeusAirportNearest = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    radius: z.number().int().min(1).max(500).optional().default(500),
  })
  .strip();

const amadeusAirportRoutes = z
  .object({
    airport_code: z.string().length(3),
  })
  .strip();

const amadeusAirlineLookup = z
  .object({
    airline_code: z.string().min(2).max(3),
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
