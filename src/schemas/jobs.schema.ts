import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// jobs.salary_data — BLS (US Bureau of Labor Statistics timeseries data)
// ---------------------------------------------------------------------------

const jobsSalaryData = z
  .object({
    series_ids: z
      .array(z.string().min(1))
      .min(1)
      .max(50)
      .describe(
        'BLS timeseries IDs (e.g. ["OEUM0000000000000151252004"] for Software Developers mean salary). Encodes occupation code + geography + data type.',
      ),
    start_year: z
      .string()
      .regex(/^\d{4}$/)
      .optional()
      .describe('Start year (e.g. "2020"). Omit for latest available.'),
    end_year: z
      .string()
      .regex(/^\d{4}$/)
      .optional()
      .describe('End year (e.g. "2024"). Omit for latest available.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// jobs.occupation_search — O*NET (occupational taxonomy search)
// ---------------------------------------------------------------------------

const jobsOccupationSearch = z
  .object({
    keyword: z
      .string()
      .min(1)
      .max(200)
      .describe('Search keyword for occupations (e.g. "software developer", "nurse", "data analyst").'),
    start: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Starting index for pagination (1-based). Omit for first page.'),
    end: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Ending index for pagination. Omit for default page size.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// jobs.occupation_details — O*NET (detailed occupation info + section summaries)
// ---------------------------------------------------------------------------

const jobsOccupationDetails = z
  .object({
    code: z
      .string()
      .min(1)
      .max(20)
      .describe('O*NET SOC occupation code (e.g. "15-1252.00" for Software Developers). Get codes from occupation_search.'),
    section: z
      .enum(['skills', 'knowledge', 'abilities', 'technology_skills', 'tasks'])
      .optional()
      .describe('Specific section to retrieve. Omit for general overview (title, description, sample titles).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// jobs.esco_search — ESCO (EU Skills/Competences/Occupations search)
// ---------------------------------------------------------------------------

const jobsEscoSearch = z
  .object({
    text: z
      .string()
      .min(1)
      .max(500)
      .describe('Search text for EU occupations or skills (e.g. "software developer", "project management").'),
    type: z
      .enum(['occupation', 'skill'])
      .optional()
      .describe('Resource type to search. Default: "occupation".'),
    language: z
      .string()
      .min(2)
      .max(5)
      .optional()
      .describe('ISO 639-1 language code (e.g. "en", "de", "fr"). Default: "en". ESCO supports 27 EU languages.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Results per page (default 25, max 100).'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination. Omit for first page.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// jobs.esco_details — ESCO (EU resource details by URI)
// ---------------------------------------------------------------------------

const jobsEscoDetails = z
  .object({
    uri: z
      .string()
      .min(1)
      .describe('ESCO resource URI (e.g. "http://data.europa.eu/esco/occupation/..."). Get URIs from esco_search.'),
    type: z
      .enum(['occupation', 'skill'])
      .optional()
      .describe('Resource type: "occupation" or "skill". Default: "occupation".'),
    language: z
      .string()
      .min(2)
      .max(5)
      .optional()
      .describe('ISO 639-1 language code. Default: "en".'),
  })
  .strip();

// ---------------------------------------------------------------------------
// jobs.job_search — CareerJet v4 (global job listings aggregator)
// ---------------------------------------------------------------------------

const jobsJobSearch = z
  .object({
    keywords: z
      .string()
      .min(1)
      .max(500)
      .describe('Job search keywords (e.g. "software engineer", "marketing manager remote").'),
    location: z
      .string()
      .max(200)
      .optional()
      .describe('Location filter (e.g. "New York", "London", "Berlin"). Omit for worldwide.'),
    locale_code: z
      .string()
      .min(2)
      .max(10)
      .optional()
      .describe('Locale code for results (e.g. "en_US", "en_GB", "de_DE"). Default: "en_US".'),
    contract_type: z
      .enum(['permanent', 'contract', 'temporary', 'internship', 'volunteering'])
      .optional()
      .describe('Filter by contract type.'),
    work_hours: z
      .enum(['full_time', 'part_time'])
      .optional()
      .describe('Filter by work hours.'),
    sort: z
      .enum(['relevance', 'date', 'salary'])
      .optional()
      .describe('Sort order for results. Default: "relevance".'),
    page: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe('Page number (1-10). Default: 1.'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Results per page (1-100). Default: 20.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const jobsSchemas: Record<string, ZodSchema> = {
  'jobs.salary_data': jobsSalaryData,
  'jobs.occupation_search': jobsOccupationSearch,
  'jobs.occupation_details': jobsOccupationDetails,
  'jobs.esco_search': jobsEscoSearch,
  'jobs.esco_details': jobsEscoDetails,
  'jobs.job_search': jobsJobSearch,
};
