import { z, type ZodSchema } from 'zod';

const resolve = z.object({
  identifier: z.string().min(1).describe('Chemical identifier to resolve — compound name (e.g. "aspirin", "caffeine"), CAS number (e.g. "50-78-2"), SMILES (e.g. "CC(=O)Oc1ccccc1C(O)=O"), or InChIKey (e.g. "BSYNRYMUTXBXSQ-UHFFFAOYSA-N")'),
  output: z.enum(['all', 'smiles', 'stdinchi', 'stdinchikey']).optional().default('all').describe('Output format: "all" (SMILES + InChI + InChIKey), "smiles" (canonical SMILES only), "stdinchi" (Standard InChI only), "stdinchikey" (InChIKey only). Default: "all"'),
}).strip();

const formula = z.object({
  identifier: z.string().min(1).describe('Chemical identifier — compound name (e.g. "ibuprofen"), CAS number (e.g. "15687-27-1"), or SMILES string. Returns molecular formula and weight'),
}).strip();

const names = z.object({
  identifier: z.string().min(1).describe('Chemical identifier to look up synonyms for — compound name, CAS number, SMILES, or InChIKey (e.g. "aspirin", "50-78-2")'),
  limit: z.number().int().min(1).max(100).optional().default(20).describe('Maximum number of names/synonyms to return (1-100). Default: 20'),
}).strip();

export const cactusSchemas: Record<string, ZodSchema> = {
  'chem.resolve': resolve,
  'chem.formula': formula,
  'chem.names': names,
};
