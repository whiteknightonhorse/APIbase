import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// gus-poland.subjects — browse the BDL topic/subject tree
// ---------------------------------------------------------------------------

const gusPolandSubjects = z
  .object({
    parent_id: z
      .string()
      .optional()
      .describe(
        'BDL subject-tree node id to list children of (e.g. "K15" for PRICES, "G186" for a sub-topic). Omit to list the 33 root-level topic categories.',
      ),
    page: z.number().int().min(0).optional().describe('Zero-based page number (default 0).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Results per page, 1-100 (default 20).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// gus-poland.variables — search or list statistical variables
// ---------------------------------------------------------------------------

const gusPolandVariables = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Search variables by keyword in their name, e.g. "population", "unemployment", "average salary". Either query or subject_id is required.',
      ),
    subject_id: z
      .string()
      .optional()
      .describe(
        'List all variables under a leaf subject id (hasVariables=true) from gus-poland.subjects, e.g. "P1458". Either query or subject_id is required.',
      ),
    page: z.number().int().min(0).optional().describe('Zero-based page number (default 0).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Results per page, 1-100 (default 20).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// gus-poland.data — statistical values for a variable
// ---------------------------------------------------------------------------

const gusPolandData = z
  .object({
    variable_id: z
      .number()
      .int()
      .describe(
        'Numeric variable id from gus-poland.variables (e.g. 4859 for "wheat 1 dt" procurement price).',
      ),
    unit_id: z
      .string()
      .optional()
      .describe(
        'BDL 12-digit territorial unit code to fetch a single unit\'s series (e.g. "000000000000" for all of Poland, "011200000000" for Małopolskie voivodeship). If set, unit_level is ignored.',
      ),
    unit_level: z
      .number()
      .int()
      .min(0)
      .max(7)
      .optional()
      .describe(
        'Administrative level to break the data down by when unit_id is not set: 0=Poland, 1=macroregion, 2=voivodeship, 3=region, 4=subregion, 5=powiat (county), 6=gmina (municipality), 7=statistical locality. Default 2 (voivodeship).',
      ),
    year: z
      .array(z.number().int())
      .max(10)
      .optional()
      .describe(
        'One or more specific years to filter by, e.g. [2022, 2023]. Omit to return the full available history.',
      ),
    page: z.number().int().min(0).optional().describe('Zero-based page number (default 0).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Territorial units per page, 1-100 (default 20).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const gusPolandSchemas: Record<string, ZodSchema> = {
  'gus-poland.subjects': gusPolandSubjects,
  'gus-poland.variables': gusPolandVariables,
  'gus-poland.data': gusPolandData,
};
