import { z, type ZodSchema } from 'zod';

const aviasalesSearchFlights = z
  .object({
    origin: z.string().min(2).max(4).describe('Departure city or airport IATA code (e.g. MOW, JFK, BKK)'),
    destination: z.string().min(2).max(4).optional().describe('Arrival IATA code (omit to search all destinations)'),
    departure_date: z.string().optional().describe('Departure date in YYYY-MM-DD format (filters results to this date and later)'),
    direct_only: z.boolean().optional().describe('Only show non-stop flights (default false)'),
    currency: z.string().length(3).optional().describe('Currency code for prices (default usd)'),
    limit: z.number().int().min(1).max(30).optional().describe('Max number of results to return (default 10)'),
  })
  .strip();

const aviasalesPriceCalendar = z
  .object({
    origin: z.string().min(2).max(4).describe('Departure city or airport IATA code (e.g. MOW, JFK)'),
    destination: z.string().min(2).max(4).describe('Arrival IATA code (e.g. BKK, LON)'),
    month: z.string().optional().describe('Month in YYYY-MM format to get calendar prices (e.g. 2026-06)'),
    currency: z.string().length(3).optional().describe('Currency code for prices (default usd)'),
  })
  .strip();

const aviasalesCheapFlights = z
  .object({
    origin: z.string().min(2).max(4).describe('Departure city or airport IATA code (e.g. MOW, BER)'),
    destination: z.string().min(2).max(4).optional().describe('Arrival IATA code (omit to find cheapest flights to anywhere)'),
    departure_month: z.string().optional().describe('Filter by departure month in YYYY-MM format'),
    direct_only: z.boolean().optional().describe('Only return direct (non-stop) flights'),
    currency: z.string().length(3).optional().describe('Currency code for prices (default usd)'),
  })
  .strip();

const aviasalesPopularRoutes = z
  .object({
    origin: z.string().min(2).max(4).describe('Departure city IATA code (e.g. MOW, NYC, LON)'),
    currency: z.string().length(3).optional().describe('Currency code for prices (default usd)'),
  })
  .strip();

const aviasalesNearbyDestinations = z
  .object({
    origin: z.string().min(2).max(4).describe('Departure city IATA code (e.g. MOW)'),
    destination: z.string().min(2).max(4).describe('Target destination IATA code — also searches nearby airports'),
    depart_date: z.string().optional().describe('Departure date in YYYY-MM-DD format'),
    return_date: z.string().optional().describe('Return date in YYYY-MM-DD format'),
    flexibility: z.number().int().min(0).max(7).optional().describe('Date flexibility in days (+/- from given dates)'),
    currency: z.string().length(3).optional().describe('Currency code for prices (default usd)'),
  })
  .strip();

const aviasalesAirportLookup = z
  .object({
    query: z.string().min(1).describe('Airport name, city name, or IATA code to search for (e.g. Bangkok, JFK, Heathrow)'),
  })
  .strip();

export const aviasalesSchemas: Record<string, ZodSchema> = {
  'aviasales.search_flights': aviasalesSearchFlights,
  'aviasales.price_calendar': aviasalesPriceCalendar,
  'aviasales.cheap_flights': aviasalesCheapFlights,
  'aviasales.popular_routes': aviasalesPopularRoutes,
  'aviasales.nearby_destinations': aviasalesNearbyDestinations,
  'aviasales.airport_lookup': aviasalesAirportLookup,
};
