import { z } from 'zod';

export const chemblSchemas: Record<string, z.ZodTypeAny> = {
  'chembl.molecule_search': z
    .object({
      query: z
        .string()
        .optional()
        .describe(
          'Drug or molecule name to search (case-insensitive substring match). ' +
            'Examples: "aspirin", "ibuprofen", "paclitaxel". ' +
            'Omit to browse all molecules with other filters applied.',
        ),
      max_phase: z
        .number()
        .int()
        .min(0)
        .max(4)
        .optional()
        .describe(
          'Exact clinical development phase filter. ' +
            '0 = preclinical, 1 = Phase I, 2 = Phase II, 3 = Phase III, 4 = approved/marketed. ' +
            'Use max_phase_gte for "at least" filtering.',
        ),
      max_phase_gte: z
        .number()
        .int()
        .min(0)
        .max(4)
        .optional()
        .describe(
          'Minimum clinical development phase. ' +
            'max_phase_gte=4 returns only approved drugs. ' +
            'max_phase_gte=3 returns Phase III and approved drugs.',
        ),
      molecule_type: z
        .enum([
          'Small molecule',
          'Protein',
          'Antibody',
          'Oligosaccharide',
          'Oligonucleotide',
          'Cell',
          'Enzyme',
          'Unknown',
        ])
        .optional()
        .describe(
          'Filter by molecule type. ' +
            'Small molecule covers most traditional drugs. ' +
            'Protein/Antibody covers biologics.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .default(10)
        .describe('Number of results to return (1–25, default 10).'),
    })
    .strip(),

  'chembl.molecule_detail': z
    .object({
      chembl_id: z
        .string()
        .describe(
          'ChEMBL molecule identifier (e.g. CHEMBL25 for aspirin, CHEMBL521 for ibuprofen). ' +
            'Use chembl.molecule.search to find IDs by name.',
        ),
    })
    .strip(),

  'chembl.target_search': z
    .object({
      query: z
        .string()
        .optional()
        .describe(
          'Biological target name to search (case-insensitive substring match). ' +
            'Examples: "Acetylcholinesterase", "Epidermal growth factor receptor", "COX-2". ' +
            'Omit to browse with other filters.',
        ),
      target_type: z
        .enum([
          'SINGLE PROTEIN',
          'PROTEIN COMPLEX',
          'PROTEIN FAMILY',
          'NUCLEIC-ACID',
          'CELL-LINE',
          'TISSUE',
          'ORGANISM',
          'UNKNOWN',
        ])
        .optional()
        .describe(
          'Filter by target classification. ' +
            'SINGLE PROTEIN is the most common for drug targets. ' +
            'PROTEIN COMPLEX for multi-subunit targets.',
        ),
      organism: z
        .string()
        .optional()
        .describe(
          'Filter by source organism (case-insensitive substring match). ' +
            'Examples: "Homo sapiens", "Rattus norvegicus", "Escherichia coli".',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .default(10)
        .describe('Number of results to return (1–25, default 10).'),
    })
    .strip(),

  'chembl.bioactivity': z
    .object({
      molecule_chembl_id: z
        .string()
        .optional()
        .describe(
          'ChEMBL molecule ID to retrieve bioactivity data for (e.g. CHEMBL25). ' +
            'Returns all assay measurements for this compound. ' +
            'Provide at least one of molecule_chembl_id or target_chembl_id.',
        ),
      target_chembl_id: z
        .string()
        .optional()
        .describe(
          'ChEMBL target ID to retrieve bioactivity data for (e.g. CHEMBL220 for Acetylcholinesterase). ' +
            'Returns activity measurements from all tested compounds against this target. ' +
            'Provide at least one of molecule_chembl_id or target_chembl_id.',
        ),
      activity_type: z
        .string()
        .optional()
        .describe(
          'Filter by activity measurement type. ' +
            'Common values: IC50 (inhibitor concentration 50%), Ki (inhibition constant), ' +
            'EC50 (effective concentration 50%), Kd (dissociation constant), ' +
            'MIC (minimum inhibitory concentration), GI50 (growth inhibition 50%). ' +
            'Case-sensitive; use uppercase.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .default(10)
        .describe('Number of activity records to return (1–25, default 10).'),
    })
    .strip(),
};
