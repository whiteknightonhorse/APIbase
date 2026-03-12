import { z, type ZodSchema } from 'zod';

const sabreSearchFlights = z
  .object({
    origin: z.string().length(3).describe('Origin airport IATA code (e.g. JFK, LAX)'),
    destination: z.string().length(3).describe('Destination airport IATA code (e.g. CDG, LHR)'),
    departure_date: z.string().describe('Departure date in YYYY-MM-DD format'),
    return_date: z.string().optional().describe('Return date in YYYY-MM-DD format for round trips'),
    point_of_sale: z.string().length(2).optional().default('US').describe('2-letter country code for pricing (e.g. US, GB)'),
    limit: z.number().int().min(1).max(50).optional().describe('Max number of flight offers (1-50)'),
  })
  .strip();

const sabreDestinationFinder = z
  .object({
    origin: z.string().length(3).describe('Origin airport IATA code (e.g. JFK, LAX)'),
    departure_date: z.string().describe('Departure date in YYYY-MM-DD format'),
    return_date: z.string().describe('Return date in YYYY-MM-DD format'),
    point_of_sale: z.string().length(2).optional().default('US').describe('2-letter country code for pricing (e.g. US, GB)'),
    max_fare: z.number().positive().optional().describe('Maximum fare in USD to filter results'),
  })
  .strip();

const sabreAirlineLookup = z
  .object({
    airline_code: z.string().min(2).max(3).describe('Airline IATA (2-char) or ICAO (3-char) code'),
  })
  .strip();

const sabreTravelThemes = z.object({}).strip();

export const sabreSchemas: Record<string, ZodSchema> = {
  'sabre.search_flights': sabreSearchFlights,
  'sabre.destination_finder': sabreDestinationFinder,
  'sabre.airline_lookup': sabreAirlineLookup,
  'sabre.travel_themes': sabreTravelThemes,
};
