import { z, type ZodSchema } from 'zod';

const compoundSearch = z.object({
  name: z.string().describe('Compound name, formula, or SMILES string (e.g. "aspirin", "C9H8O4", "CC(=O)OC1=CC=CC=C1C(=O)O")'),
  limit: z.number().int().min(1).max(20).optional().describe('Maximum results to return (1-20, default 5)'),
}).strip();

const compoundProperties = z.object({
  cid: z.number().int().describe('PubChem Compound ID (CID) — get from compound_search results'),
}).strip();

const compoundSynonyms = z.object({
  cid: z.number().int().describe('PubChem Compound ID (CID) — returns all known names, CAS numbers, trade names'),
}).strip();

const hazardData = z.object({
  cid: z.number().int().describe('PubChem Compound ID (CID) — returns GHS hazard classification, pictograms, signal words'),
}).strip();

const bioassaySummary = z.object({
  cid: z.number().int().describe('PubChem Compound ID (CID) — returns bioactivity assay results (active/inactive counts, targets)'),
}).strip();

const structureLookup = z.object({
  name: z.string().describe('Compound name or identifier (e.g. "caffeine", "50-78-2") — returns SMILES, InChI, InChIKey, formula'),
}).strip();

export const pubchemSchemas: Record<string, ZodSchema> = {
  'pubchem.compound_search': compoundSearch,
  'pubchem.compound_properties': compoundProperties,
  'pubchem.compound_synonyms': compoundSynonyms,
  'pubchem.hazard_data': hazardData,
  'pubchem.bioassay_summary': bioassaySummary,
  'pubchem.structure_lookup': structureLookup,
};
