import { z, type ZodSchema } from 'zod';

const recalls = z.object({
  make: z.string().min(1).describe('Vehicle manufacturer name (e.g. "Toyota", "Ford", "Tesla", "BMW")'),
  model: z.string().min(1).describe('Vehicle model name (e.g. "Camry", "Model 3", "F-150", "X5")'),
  model_year: z.number().int().min(1966).max(2030).describe('Model year (e.g. 2023). NHTSA recall data available from 1966 to present'),
}).strip();

const complaints = z.object({
  make: z.string().min(1).describe('Vehicle manufacturer name (e.g. "Toyota", "Ford", "Tesla", "Honda")'),
  model: z.string().min(1).describe('Vehicle model name (e.g. "Camry", "Model 3", "Civic")'),
  model_year: z.number().int().min(1995).max(2030).describe('Model year (e.g. 2023). NHTSA complaint data available from ~1995 to present'),
}).strip();

const ratings = z.object({
  make: z.string().optional().describe('Vehicle manufacturer name (e.g. "Toyota", "Honda"). Required unless vehicle_id is provided'),
  model: z.string().optional().describe('Vehicle model name (e.g. "Camry", "Civic"). Required unless vehicle_id is provided'),
  model_year: z.number().int().min(2011).max(2030).optional().describe('Model year (e.g. 2023). 5-Star ratings available from ~2011. Required unless vehicle_id is provided'),
  vehicle_id: z.number().int().optional().describe('NHTSA Vehicle ID for full ratings detail (get from initial search). Overrides make/model/year if provided'),
}).strip();

const investigations = z.object({
  make: z.string().min(1).describe('Vehicle manufacturer name (e.g. "Tesla", "GM", "Ford")'),
  model: z.string().optional().describe('Vehicle model name to narrow results (e.g. "Model 3", "Bolt EV")'),
}).strip();

export const nhtsaSafetySchemas: Record<string, ZodSchema> = {
  'safety.recalls': recalls,
  'safety.complaints': complaints,
  'safety.ratings': ratings,
  'safety.investigations': investigations,
};
