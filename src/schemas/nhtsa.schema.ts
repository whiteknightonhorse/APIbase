import { z, type ZodSchema } from 'zod';
const decode = z.object({ vin: z.string().length(17).describe('17-character Vehicle Identification Number (e.g. "1HGCM82633A004352")') }).strip();
const models = z.object({ make: z.string().optional().describe('Vehicle make (e.g. "Honda", "Toyota", "Ford")'), year: z.number().int().optional().describe('Model year (e.g. 2024)') }).strip();
export const nhtsaSchemas: Record<string, ZodSchema> = { 'vin.decode': decode, 'vin.models': models };
