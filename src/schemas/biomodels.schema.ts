import { z, type ZodSchema } from 'zod';

const modelSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Keyword to search for biological mathematical models — e.g. "insulin signaling", ' +
          '"circadian clock", "glucose metabolism", "COVID-19". ' +
          'Supports free-text and can include organism names, disease terms, pathway names, or author names.',
      ),
    curation_status: z
      .enum(['CURATED', 'NON_CURATED'])
      .optional()
      .describe(
        'Filter by curation status. "CURATED" returns only manually reviewed, ' +
          'peer-validated models from the BioModels curated branch (highest quality). ' +
          '"NON_CURATED" returns all submitted models including author-provided ones. ' +
          'Omit to search all models.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results to return (1–50, default 10)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset — number of results to skip (default 0)'),
  })
  .strip();

const modelDetail = z
  .object({
    model_id: z
      .string()
      .min(1)
      .describe(
        'BioModels accession identifier. Curated models use BIOMD prefix followed by 10 digits ' +
          '(e.g. "BIOMD0000000001", "BIOMD0000000295"). Author-submitted models use MODEL prefix ' +
          '(e.g. "MODEL1204270001"). Obtain IDs from biomodels.model.search results.',
      ),
  })
  .strip();

const modelFiles = z
  .object({
    model_id: z
      .string()
      .min(1)
      .describe(
        'BioModels accession identifier (e.g. "BIOMD0000000001"). ' +
          'Returns all downloadable file representations: SBML (primary), BioPAX levels 2 and 3, ' +
          'MATLAB/Octave scripts, and any author-provided supplementary files. ' +
          'Each entry includes the direct download URL, MIME type, file size, and MD5 checksum.',
      ),
  })
  .strip();

const modelLatest = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of recent curated models to return (1–50, default 10)'),
  })
  .strip();

export const biomodelsSchemas: Record<string, ZodSchema> = {
  'biomodels.model.search': modelSearch,
  'biomodels.model.detail': modelDetail,
  'biomodels.model.files': modelFiles,
  'biomodels.model.latest': modelLatest,
};
