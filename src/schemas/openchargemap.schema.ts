import { z, type ZodSchema } from 'zod';

const evchargeSearch = z.object({
  country_code: z.string().optional().describe('ISO 2-letter country code to filter by (e.g. "US", "GB", "DE")'),
  latitude: z.number().optional().describe('Latitude for location-based search (e.g. 51.5074)'),
  longitude: z.number().optional().describe('Longitude for location-based search (e.g. -0.1278)'),
  distance: z.number().optional().describe('Search radius in distance_unit (default KM)'),
  distance_unit: z.enum(['KM', 'Miles']).optional().describe('Distance unit: KM or Miles (default KM)'),
  operator_id: z.number().int().optional().describe('Filter by charging network operator ID'),
  connection_type_id: z.number().int().optional().describe('Filter by connector type (e.g. 25=Type 2, 33=CCS, 2=CHAdeMO)'),
  min_power_kw: z.number().optional().describe('Minimum charger power in kW (e.g. 50 for fast charging)'),
  status_type_id: z.number().int().optional().describe('Filter by status (50=Operational, 100=Not Operational)'),
  limit: z.number().int().min(1).max(100).optional().describe('Maximum results to return (1-100, default 20)'),
}).strip();

const evchargeDetails = z.object({
  id: z.number().int().describe('Open Charge Map station ID — get from search or nearby results'),
}).strip();

const evchargeNearby = z.object({
  latitude: z.number().describe('GPS latitude of your location (e.g. 40.7128)'),
  longitude: z.number().describe('GPS longitude of your location (e.g. -74.0060)'),
  radius: z.number().optional().describe('Search radius in KM (default 5)'),
  min_power_kw: z.number().optional().describe('Minimum charger power in kW (e.g. 50 for DC fast charging)'),
  connection_type_id: z.number().int().optional().describe('Filter by connector type (25=Type 2, 33=CCS, 2=CHAdeMO)'),
  limit: z.number().int().min(1).max(50).optional().describe('Maximum results (1-50, default 10)'),
}).strip();

export const openchargemapSchemas: Record<string, ZodSchema> = {
  'evcharge.search': evchargeSearch,
  'evcharge.details': evchargeDetails,
  'evcharge.nearby': evchargeNearby,
};
