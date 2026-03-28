import { z, type ZodSchema } from 'zod';

const search = z.object({
  query: z.string().min(1).describe('Search query — keyword, protein name, organism, or author (e.g. "insulin", "hemoglobin", "Homo sapiens", "Watson")'),
  limit: z.number().int().min(1).max(50).optional().default(10).describe('Maximum number of results (1-50). Default: 10'),
}).strip();

const structure = z.object({
  pdb_id: z.string().length(4).describe('4-character PDB identifier (e.g. "4HHB" for hemoglobin, "1BNA" for DNA, "6LU7" for SARS-CoV-2 main protease)'),
}).strip();

const ligand = z.object({
  ligand_id: z.string().min(1).max(5).describe('Chemical component identifier — standard 3-letter code (e.g. "ATP" for adenosine triphosphate, "HEM" for heme, "NAG" for N-acetylglucosamine, "ZN" for zinc ion)'),
}).strip();

const sequence = z.object({
  sequence: z.string().min(10).describe('Protein amino acid sequence in one-letter code (e.g. "MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSH" — first 50 residues of human hemoglobin alpha)'),
  identity_cutoff: z.number().min(0.1).max(1.0).optional().default(0.9).describe('Minimum sequence identity (0.1-1.0). Default: 0.9 (90% identical)'),
  evalue_cutoff: z.number().optional().default(0.1).describe('Maximum E-value threshold for BLAST significance. Default: 0.1'),
  limit: z.number().int().min(1).max(50).optional().default(10).describe('Maximum number of results (1-50). Default: 10'),
}).strip();

export const rcsbSchemas: Record<string, ZodSchema> = {
  'pdb.search': search,
  'pdb.structure': structure,
  'pdb.ligand': ligand,
  'pdb.sequence': sequence,
};
