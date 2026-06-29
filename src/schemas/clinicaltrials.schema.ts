import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    condition: z
      .string()
      .optional()
      .describe(
        'Disease or condition to search for (e.g. "diabetes", "breast cancer", "COVID-19"). ' +
          'Searches the conditions field of registered trials.',
      ),
    intervention: z
      .string()
      .optional()
      .describe(
        'Drug or intervention to search for (e.g. "aspirin", "metformin", "CAR T-cell therapy"). ' +
          'Searches the interventions field of registered trials.',
      ),
    sponsor: z
      .string()
      .optional()
      .describe(
        'Sponsor or organization name to search for (e.g. "Pfizer", "NIH", "Mayo Clinic"). ' +
          'Searches the lead sponsor field.',
      ),
    keyword: z
      .string()
      .optional()
      .describe(
        'Free-text keyword search across all text fields of the trial record ' +
          '(e.g. "immunotherapy", "biomarker", "phase 3 randomized").',
      ),
    status: z
      .enum([
        'RECRUITING',
        'NOT_YET_RECRUITING',
        'ACTIVE_NOT_RECRUITING',
        'COMPLETED',
        'TERMINATED',
        'WITHDRAWN',
        'SUSPENDED',
        'UNKNOWN',
      ])
      .optional()
      .describe(
        'Filter by overall trial status. Most useful values: "RECRUITING" (open enrollment), ' +
          '"COMPLETED" (finished), "ACTIVE_NOT_RECRUITING" (ongoing but closed to new participants).',
      ),
    phase: z
      .enum(['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4', 'EARLY_PHASE1', 'NA'])
      .optional()
      .describe(
        'Filter by clinical trial phase. PHASE1=safety, PHASE2=efficacy, PHASE3=confirmatory, ' +
          'PHASE4=post-market, NA=not applicable (e.g. observational studies).',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe('Maximum number of results to return (1–50). Default: 10.'),
    page_token: z
      .string()
      .optional()
      .describe(
        'Pagination token from a previous search response (next_page_token field). ' +
          'Omit for the first page.',
      ),
  })
  .strip();

const study = z
  .object({
    nct_id: z
      .string()
      .regex(/^NCT\d{8}$/)
      .describe(
        'ClinicalTrials.gov registry identifier in NCT format (e.g. "NCT04368728", ' +
          '"NCT01454700"). Must start with "NCT" followed by 8 digits.',
      ),
  })
  .strip();

const recruiting = z
  .object({
    condition: z
      .string()
      .optional()
      .describe(
        'Disease or condition to search for among currently recruiting trials ' +
          '(e.g. "lung cancer", "Alzheimer", "type 2 diabetes").',
      ),
    intervention: z
      .string()
      .optional()
      .describe(
        'Drug or intervention to search for among recruiting trials ' +
          '(e.g. "pembrolizumab", "mRNA vaccine", "gene therapy").',
      ),
    phase: z
      .enum(['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4', 'EARLY_PHASE1', 'NA'])
      .optional()
      .describe(
        'Restrict to a specific trial phase among recruiting studies. ' +
          'PHASE3 = large confirmatory trials; PHASE1 = early safety studies.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe('Maximum number of recruiting trials to return (1–50). Default: 10.'),
  })
  .strip();

const stats = z
  .object({
    dummy: z
      .string()
      .optional()
      .describe(
        'Unused parameter — included for schema compatibility. Leave empty. ' +
          'Returns total study count and average record size from ClinicalTrials.gov.',
      ),
  })
  .strip();

export const clinicaltrialsSchemas: Record<string, ZodSchema> = {
  'clinicaltrials.search': search,
  'clinicaltrials.study': study,
  'clinicaltrials.recruiting': recruiting,
  'clinicaltrials.stats': stats,
};
