import { z, type ZodSchema } from 'zod';

const active = z.object({
  area: z.string().optional().describe('US state code (e.g. "CA", "TX", "NY") or marine zone'),
  severity: z.enum(['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown']).optional().describe('Alert severity filter'),
  event: z.string().optional().describe('Event type filter (e.g. "Tornado Warning", "Flood Watch", "Heat Advisory")'),
  urgency: z.enum(['Immediate', 'Expected', 'Future', 'Past', 'Unknown']).optional().describe('Urgency filter'),
  limit: z.number().int().min(1).max(50).optional().describe('Max alerts to return (default 10, max 50)'),
}).strip();

const byArea = z.object({
  state: z.string().length(2).describe('US state code (e.g. "CA", "FL", "TX")'),
  limit: z.number().int().min(1).max(50).optional().describe('Max alerts (default 10, max 50)'),
}).strip();

export const nwsSchemas: Record<string, ZodSchema> = {
  'weather_alerts.active': active,
  'weather_alerts.by_area': byArea,
};
