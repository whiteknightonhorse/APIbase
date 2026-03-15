import { z, type ZodSchema } from 'zod';

const foursquarePlaceSearch = z
  .object({
    query: z.string().optional().describe('Search term (e.g. "restaurant", "coffee", "hotel")'),
    near: z.string().optional().describe('Place name for geographic context (e.g. "Bangkok,Thailand", "New York,NY")'),
    ll: z.string().optional().describe('Latitude,longitude (e.g. "13.7563,100.5018"). Use either near or ll, not both'),
    radius: z.number().int().min(1).max(100000).optional().describe('Search radius in meters (max 100000)'),
    categories: z.string().optional().describe('Comma-separated Foursquare category IDs to filter results'),
    limit: z.number().int().min(1).max(50).optional().describe('Max results to return (1-50, default 10)'),
    sort: z.enum(['relevance', 'rating', 'distance', 'popularity']).optional().describe('Sort order for results'),
    open_now: z.boolean().optional().describe('Filter to only places open now'),
  })
  .strip();

const foursquarePlaceDetails = z
  .object({
    fsq_id: z.string().describe('Foursquare place ID (e.g. "4b5988fef964a520e62a28e3")'),
  })
  .strip();

const foursquarePlaceTips = z
  .object({
    fsq_id: z.string().describe('Foursquare place ID to get tips for'),
    limit: z.number().int().min(1).max(50).optional().describe('Max tips to return (1-50, default 10)'),
    sort: z.enum(['popular', 'newest', 'oldest']).optional().describe('Sort order for tips: popular, newest, or oldest'),
  })
  .strip();

const foursquarePlacePhotos = z
  .object({
    fsq_id: z.string().describe('Foursquare place ID to get photos for'),
    limit: z.number().int().min(1).max(50).optional().describe('Max photos to return (1-50, default 10)'),
    sort: z.enum(['popular', 'newest']).optional().describe('Sort order for photos'),
    classifications: z.string().optional().describe('Comma-separated photo classifications (e.g. "food,indoor,outdoor")'),
  })
  .strip();

const foursquareAutocomplete = z
  .object({
    query: z.string().describe('Search query for autocomplete suggestions'),
    ll: z.string().optional().describe('Latitude,longitude to bias results (e.g. "13.7563,100.5018")'),
    radius: z.number().int().min(1).max(100000).optional().describe('Bias radius in meters'),
    limit: z.number().int().min(1).max(10).optional().describe('Max suggestions to return (1-10, default 5)'),
    types: z.string().optional().describe('Comma-separated result types (e.g. "place,address,search")'),
  })
  .strip();

export const foursquareSchemas: Record<string, ZodSchema> = {
  'foursquare.place_search': foursquarePlaceSearch,
  'foursquare.place_details': foursquarePlaceDetails,
  'foursquare.place_tips': foursquarePlaceTips,
  'foursquare.place_photos': foursquarePlacePhotos,
  'foursquare.autocomplete': foursquareAutocomplete,
};
