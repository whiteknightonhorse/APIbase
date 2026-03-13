import { z, type ZodSchema } from 'zod';

const ticketmasterEventsSearch = z
  .object({
    keyword: z.string().optional().describe('Search keyword (e.g. "concert", "NBA", "Taylor Swift")'),
    city: z.string().optional().describe('City name to filter events (e.g. "New York", "London")'),
    countryCode: z.string().length(2).optional().describe('ISO 3166-1 alpha-2 country code (e.g. "US", "GB", "DE")'),
    stateCode: z.string().optional().describe('State code for US/CA events (e.g. "NY", "CA", "ON")'),
    classificationName: z.string().optional().describe('Event category filter (e.g. "Music", "Sports", "Arts & Theatre")'),
    startDateTime: z.string().optional().describe('Start date/time in ISO 8601 format with Z suffix (e.g. "2026-04-01T00:00:00Z")'),
    endDateTime: z.string().optional().describe('End date/time in ISO 8601 format with Z suffix (e.g. "2026-12-31T23:59:59Z")'),
    size: z.number().int().min(1).max(200).optional().describe('Number of results per page (1-200, default 20)'),
    page: z.number().int().min(0).optional().describe('Page number (0-based)'),
    sort: z.string().optional().describe('Sort order (e.g. "date,asc", "relevance,desc", "name,asc")'),
    locale: z.string().optional().describe('Locale for response (e.g. "en-us", "fr-fr")'),
  })
  .strip();

const ticketmasterEventDetails = z
  .object({
    id: z.string().describe('Ticketmaster event ID (e.g. "vvG1iZ4JkS1GKT")'),
    locale: z.string().optional().describe('Locale for response (e.g. "en-us")'),
  })
  .strip();

const ticketmasterEventsNearby = z
  .object({
    latlong: z.string().describe('Latitude,longitude coordinates (e.g. "40.7128,-74.0060" for NYC)'),
    radius: z.number().int().min(1).max(500).optional().describe('Search radius (default unit: miles, max 500)'),
    unit: z.enum(['miles', 'km']).optional().describe('Distance unit for radius (default: miles)'),
    keyword: z.string().optional().describe('Optional keyword filter (e.g. "jazz", "basketball")'),
    classificationName: z.string().optional().describe('Event category filter (e.g. "Music", "Sports")'),
    startDateTime: z.string().optional().describe('Start date/time in ISO 8601 format with Z suffix'),
    endDateTime: z.string().optional().describe('End date/time in ISO 8601 format with Z suffix'),
    size: z.number().int().min(1).max(200).optional().describe('Number of results per page (1-200, default 20)'),
    page: z.number().int().min(0).optional().describe('Page number (0-based)'),
    sort: z.string().optional().describe('Sort order (e.g. "date,asc", "distance,asc")'),
    locale: z.string().optional().describe('Locale for response (e.g. "en-us")'),
  })
  .strip();

const ticketmasterArtistEvents = z
  .object({
    keyword: z.string().optional().describe('Artist/performer name to search (e.g. "Beyonce", "Coldplay")'),
    attractionId: z.string().optional().describe('Ticketmaster attraction ID for exact artist match'),
    countryCode: z.string().length(2).optional().describe('ISO 3166-1 alpha-2 country code (e.g. "US", "GB")'),
    startDateTime: z.string().optional().describe('Start date/time in ISO 8601 format with Z suffix'),
    endDateTime: z.string().optional().describe('End date/time in ISO 8601 format with Z suffix'),
    size: z.number().int().min(1).max(200).optional().describe('Number of results per page (1-200, default 20)'),
    page: z.number().int().min(0).optional().describe('Page number (0-based)'),
    sort: z.string().optional().describe('Sort order (e.g. "date,asc", "relevance,desc")'),
    locale: z.string().optional().describe('Locale for response (e.g. "en-us")'),
  })
  .strip();

const ticketmasterVenueEvents = z
  .object({
    venueId: z.string().describe('Ticketmaster venue ID (e.g. "KovZpZA7AAEA" for Madison Square Garden)'),
    keyword: z.string().optional().describe('Optional keyword filter for events at this venue'),
    startDateTime: z.string().optional().describe('Start date/time in ISO 8601 format with Z suffix'),
    endDateTime: z.string().optional().describe('End date/time in ISO 8601 format with Z suffix'),
    size: z.number().int().min(1).max(200).optional().describe('Number of results per page (1-200, default 20)'),
    page: z.number().int().min(0).optional().describe('Page number (0-based)'),
    sort: z.string().optional().describe('Sort order (e.g. "date,asc", "relevance,desc")'),
    locale: z.string().optional().describe('Locale for response (e.g. "en-us")'),
  })
  .strip();

const ticketmasterEventsTrending = z
  .object({
    countryCode: z.string().length(2).optional().describe('ISO 3166-1 alpha-2 country code (e.g. "US", "GB")'),
    classificationName: z.string().optional().describe('Event category filter (e.g. "Music", "Sports")'),
    size: z.number().int().min(1).max(200).optional().describe('Number of results per page (1-200, default 20)'),
    page: z.number().int().min(0).optional().describe('Page number (0-based)'),
    locale: z.string().optional().describe('Locale for response (e.g. "en-us")'),
  })
  .strip();

const ticketmasterEventsCategories = z
  .object({
    size: z.number().int().min(1).max(200).optional().describe('Number of results per page (1-200, default 20)'),
    page: z.number().int().min(0).optional().describe('Page number (0-based)'),
    locale: z.string().optional().describe('Locale for response (e.g. "en-us")'),
  })
  .strip();

export const ticketmasterSchemas: Record<string, ZodSchema> = {
  'ticketmaster.events_search': ticketmasterEventsSearch,
  'ticketmaster.event_details': ticketmasterEventDetails,
  'ticketmaster.events_nearby': ticketmasterEventsNearby,
  'ticketmaster.artist_events': ticketmasterArtistEvents,
  'ticketmaster.venue_events': ticketmasterVenueEvents,
  'ticketmaster.events_trending': ticketmasterEventsTrending,
  'ticketmaster.events_categories': ticketmasterEventsCategories,
};
