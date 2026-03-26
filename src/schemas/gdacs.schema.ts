import { z } from 'zod';

const alertsSchema = z.object({
  event_type: z.enum(['EQ', 'TC', 'FL', 'VO', 'DR', 'TS']).optional().describe('Filter by disaster type: EQ=earthquake, TC=tropical cyclone, FL=flood, VO=volcano, DR=drought, TS=tsunami'),
  alert_level: z.enum(['Green', 'Orange', 'Red']).optional().describe('Minimum alert level filter: Green (low), Orange (medium), Red (high impact)'),
  limit: z.number().int().min(1).max(50).optional().describe('Number of events to return, max 50 (default 10)'),
}).strip();

const eventsSchema = z.object({
  event_id: z.number().int().describe('GDACS event ID (obtain via gdacs.alerts)'),
  event_type: z.enum(['EQ', 'TC', 'FL', 'VO', 'DR', 'TS']).describe('Event type code: EQ=earthquake, TC=tropical cyclone, FL=flood, VO=volcano, DR=drought, TS=tsunami'),
}).strip();

const historySchema = z.object({
  date_from: z.string().describe('Start date in YYYY-MM-DD format (e.g. "2024-01-01")'),
  date_to: z.string().describe('End date in YYYY-MM-DD format (e.g. "2024-12-31")'),
  event_type: z.enum(['EQ', 'TC', 'FL', 'VO', 'DR', 'TS']).optional().describe('Filter by disaster type'),
  country: z.string().optional().describe('ISO 3166-1 alpha-3 country code (e.g. "JPN", "PHL", "USA", "IDN")'),
  alert_level: z.enum(['Green', 'Orange', 'Red']).optional().describe('Minimum alert level filter'),
  limit: z.number().int().min(1).max(50).optional().describe('Number of events to return, max 50 (default 10)'),
}).strip();

export const gdacsSchemas: Record<string, z.ZodSchema> = {
  'gdacs.alerts': alertsSchema,
  'gdacs.events': eventsSchema,
  'gdacs.history': historySchema,
};
