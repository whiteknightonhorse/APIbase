/**
 * NCI CACTUS Chemical Identifier Resolver types (UC-220).
 * API returns plain text, not JSON — types are for our normalized output.
 */

export interface CactusResolveResult {
  input: string;
  smiles: string | null;
  inchi: string | null;
  inchikey: string | null;
  canonical_smiles: string | null;
}

export interface CactusFormulaResult {
  input: string;
  formula: string | null;
  molecular_weight: number | null;
}

export interface CactusNamesResult {
  input: string;
  names: string[];
  count: number;
}
