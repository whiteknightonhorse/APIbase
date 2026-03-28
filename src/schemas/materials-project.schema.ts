import { z, type ZodSchema } from 'zod';

const search = z.object({
  formula: z.string().optional().describe('Chemical formula to search (e.g. "Si", "Fe2O3", "LiFePO4"). Exact or reduced formula'),
  elements: z.string().optional().describe('Comma-separated elements to filter (e.g. "Li,Fe,O" — returns materials containing these elements)'),
  band_gap_min: z.number().optional().describe('Minimum band gap in eV (e.g. 1.0). Use with band_gap_max for range filter'),
  band_gap_max: z.number().optional().describe('Maximum band gap in eV (e.g. 3.0). Use with band_gap_min for range filter'),
  is_stable: z.boolean().optional().describe('Filter for thermodynamically stable materials only (energy_above_hull = 0)'),
  is_metal: z.boolean().optional().describe('Filter for metals (true) or non-metals (false)'),
  limit: z.number().int().min(1).max(50).optional().default(10).describe('Max results (1-50, default 10)'),
  skip: z.number().int().min(0).optional().describe('Offset for pagination'),
}).strip();

const details = z.object({
  material_id: z.string().min(1).describe('Materials Project ID (e.g. "mp-149" for silicon, "mp-19017" for LiFePO4). Get IDs from materials.search'),
}).strip();

const elasticity = z.object({
  material_id: z.string().min(1).describe('Materials Project ID (e.g. "mp-149"). Returns bulk/shear modulus, Poisson ratio, elastic tensor'),
}).strip();

export const materialsProjectSchemas: Record<string, ZodSchema> = {
  'materials.search': search,
  'materials.details': details,
  'materials.elasticity': elasticity,
};
