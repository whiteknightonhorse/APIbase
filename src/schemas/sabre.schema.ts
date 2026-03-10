import { z, type ZodSchema } from 'zod';

const sabreSearchFlights = z
  .object({
    origin: z.string().length(3),
    destination: z.string().length(3),
    departure_date: z.string(),
    return_date: z.string().optional(),
    point_of_sale: z.string().length(2).optional().default('US'),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strip();

const sabreDestinationFinder = z
  .object({
    origin: z.string().length(3),
    departure_date: z.string(),
    return_date: z.string(),
    point_of_sale: z.string().length(2).optional().default('US'),
    max_fare: z.number().positive().optional(),
  })
  .strip();

const sabreAirlineLookup = z
  .object({
    airline_code: z.string().min(2).max(3),
  })
  .strip();

const sabreTravelThemes = z.object({}).strip();

export const sabreSchemas: Record<string, ZodSchema> = {
  'sabre.search_flights': sabreSearchFlights,
  'sabre.destination_finder': sabreDestinationFinder,
  'sabre.airline_lookup': sabreAirlineLookup,
  'sabre.travel_themes': sabreTravelThemes,
};
