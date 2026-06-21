import { z, type ZodSchema } from 'zod';

export const mychemSchemas: Record<string, ZodSchema> = {
  'mychem.search': z
    .object({
      q: z
        .string()
        .min(1)
        .describe(
          'Chemical search query. Supports: common name (e.g. "aspirin"), IUPAC name (e.g. "acetylsalicylic acid"), InChIKey (e.g. "BSYNRYMUTXBXSQ-UHFFFAOYSA-N"), molecular formula (e.g. "C9H8O4"), ChEMBL ID (e.g. "CHEMBL25"), PubChem CID (e.g. "pubchem.cid:2244"), DrugBank ID (e.g. "DB00945"), or field-scoped queries (e.g. "chebi.name:ibuprofen", "drugbank.groups:approved", "chembl.max_phase:4"). Supports Lucene boolean operators AND/OR/NOT.',
        ),
      size: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum number of chemical results to return (1–50, default 10).'),
      fields: z
        .string()
        .optional()
        .describe(
          'Comma-separated annotation fields to return per hit. Default: chebi.name, chebi.definition, chebi.formula, chebi.mass, chembl.pref_name, chembl.max_phase, chembl.molecule_properties, pubchem.cid, pubchem.molecular_formula, pubchem.molecular_weight, pubchem.xlogp, drugbank.name, drugbank.groups, pharmgkb.name. Use "all" for every source.',
        ),
      scopes: z
        .string()
        .optional()
        .describe(
          'Comma-separated fields to search within. Default: searches all text fields. Examples: "chebi.name,chembl.pref_name,drugbank.name" to search only common names, or "chebi.inchikey" to search by exact InChIKey structure.',
        ),
    })
    .strip(),

  'mychem.annotation': z
    .object({
      chem_id: z
        .string()
        .min(1)
        .describe(
          'Chemical identifier to look up. Accepts: InChIKey (primary ID, e.g. "BSYNRYMUTXBXSQ-UHFFFAOYSA-N"), ChEMBL ID (e.g. "CHEMBL25"), PubChem CID (e.g. "CID2244"), or DrugBank ID (e.g. "DB00945"). InChIKey is the most stable identifier — obtain from mychem.search results or external databases (ChEMBL, PubChem, ChEBI).',
        ),
      fields: z
        .string()
        .optional()
        .describe(
          'Comma-separated annotation fields to retrieve. Default: chebi.name, chebi.definition, chebi.formula, chebi.mass, chembl.pref_name, chembl.max_phase, chembl.molecule_properties, pubchem.cid, pubchem.molecular_formula, pubchem.molecular_weight, drugbank.name, drugbank.groups, pharmgkb.name. For drug targets, add "drugbank.targets". For full ChEBI annotations, add "chebi". Use "all" for complete annotation from all 16 sources including SIDER (side effects), DrugCentral (clinical info), PharmGKB (pharmacogenomics), and NDC (drug codes).',
        ),
    })
    .strip(),

  'mychem.batch_query': z
    .object({
      q: z
        .array(z.string().describe('A chemical name, synonym, or identifier to look up.'))
        .min(1)
        .max(100)
        .describe(
          'Array of chemical queries to look up in a single request. Each element can be a chemical name, synonym, or identifier (up to 100 entries). Example: ["aspirin", "ibuprofen", "acetaminophen"]. Each query is matched against common names, synonyms, and identifiers. Returns one best-match annotation per query.',
        ),
      fields: z
        .string()
        .optional()
        .describe(
          'Comma-separated annotation fields to return for each chemical. Default: chebi.name, chebi.definition, chebi.formula, chebi.mass, chembl.pref_name, chembl.max_phase, chembl.molecule_properties, pubchem.cid, pubchem.molecular_formula, pubchem.molecular_weight, drugbank.name, drugbank.groups, pharmgkb.name. Limit fields for large batches to reduce response size.',
        ),
      scopes: z
        .string()
        .optional()
        .default('chebi.name,chembl.pref_name,drugbank.name,pubchem.cid')
        .describe(
          'Comma-separated fields to search within for each query in the batch. Default: chebi.name,chembl.pref_name,drugbank.name,pubchem.cid — searches across common name fields. Use "chebi.inchikey" to match exact InChIKeys.',
        ),
    })
    .strip(),

  'mychem.metadata': z
    .object({
      detail: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'If true, include full source metadata with download dates, record counts per source, code repository links, and license URLs. If false (default), return only build version, build date, total chemical count, and a summary list of source names.',
        ),
    })
    .strip(),
};
