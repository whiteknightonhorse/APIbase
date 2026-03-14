import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// education.paper_search — OpenAlex (academic paper search, CC0)
// ---------------------------------------------------------------------------

const educationPaperSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .max(500)
      .describe('Search text for academic papers (e.g. "machine learning", "CRISPR gene editing").'),
    concept: z
      .string()
      .max(200)
      .optional()
      .describe('OpenAlex concept ID filter (e.g. "C41008148" for Computer Science). Get IDs from OpenAlex concepts API.'),
    author: z
      .string()
      .max(200)
      .optional()
      .describe('Author name or ORCID to filter by (e.g. "Yoshua Bengio", "0000-0001-2345-6789").'),
    institution: z
      .string()
      .max(200)
      .optional()
      .describe('Institution name or ROR ID to filter by (e.g. "MIT", "Stanford University").'),
    year_from: z
      .number()
      .int()
      .min(1800)
      .max(2100)
      .optional()
      .describe('Filter papers published from this year (inclusive).'),
    year_to: z
      .number()
      .int()
      .min(1800)
      .max(2100)
      .optional()
      .describe('Filter papers published up to this year (inclusive).'),
    open_access_only: z
      .boolean()
      .optional()
      .describe('If true, only return open access papers.'),
    sort: z
      .enum(['relevance', 'cited_by_count', 'publication_date'])
      .optional()
      .describe('Sort order for results. Default: "relevance".'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results to return (1-50). Default: 10.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// education.paper_details — OpenAlex (paper details by ID or DOI)
// ---------------------------------------------------------------------------

const educationPaperDetails = z
  .object({
    id: z
      .string()
      .min(1)
      .max(200)
      .describe('OpenAlex work ID (e.g. "W2741809807") or DOI (e.g. "10.1038/nature12373"). Get IDs from paper_search.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// education.college_search — College Scorecard (US colleges/universities)
// ---------------------------------------------------------------------------

const educationCollegeSearch = z
  .object({
    name: z
      .string()
      .max(200)
      .optional()
      .describe('School name to search for (e.g. "MIT", "Stanford", "Community College").'),
    state: z
      .string()
      .length(2)
      .optional()
      .describe('US state abbreviation (e.g. "CA", "NY", "TX").'),
    degree_type: z
      .enum(['associate', 'bachelor', 'graduate'])
      .optional()
      .describe('Filter by predominant degree type awarded.'),
    program: z
      .string()
      .max(200)
      .optional()
      .describe('Field of study filter (e.g. "Computer Science", "Nursing", "Business").'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results to return (1-50). Default: 10.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// education.college_details — College Scorecard (college details by UNITID)
// ---------------------------------------------------------------------------

const educationCollegeDetails = z
  .object({
    school_id: z
      .number()
      .int()
      .positive()
      .describe('College Scorecard UNITID (e.g. 166027 for MIT). Get IDs from college_search.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// education.pubmed_search — PubMed/NCBI (biomedical literature search)
// ---------------------------------------------------------------------------

const educationPubmedSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .max(500)
      .describe('Search text for biomedical literature (e.g. "COVID-19 vaccine efficacy", "BRCA1 breast cancer").'),
    publication_type: z
      .enum(['review', 'clinical-trial', 'meta-analysis', 'any'])
      .optional()
      .describe('Filter by publication type. Default: "any".'),
    date_from: z
      .string()
      .regex(/^\d{4}\/\d{2}\/\d{2}$/)
      .optional()
      .describe('Start date filter in YYYY/MM/DD format (e.g. "2023/01/01").'),
    date_to: z
      .string()
      .regex(/^\d{4}\/\d{2}\/\d{2}$/)
      .optional()
      .describe('End date filter in YYYY/MM/DD format (e.g. "2024/12/31").'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results to return (1-50). Default: 10.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// education.arxiv_search — arXiv (preprint search, CC0 metadata)
// ---------------------------------------------------------------------------

const educationArxivSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .max(500)
      .describe('Search text for preprints (e.g. "transformer architecture", "quantum computing").'),
    category: z
      .string()
      .max(20)
      .optional()
      .describe('arXiv category filter (e.g. "cs.AI", "math.CO", "physics.hep-th", "q-bio.GN").'),
    author: z
      .string()
      .max(200)
      .optional()
      .describe('Author name to filter by (e.g. "Vaswani", "Hinton").'),
    sort: z
      .enum(['relevance', 'lastUpdatedDate', 'submittedDate'])
      .optional()
      .describe('Sort order for results. Default: "relevance".'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results to return (1-50). Default: 10.'),
  })
  .strip();

// ---------------------------------------------------------------------------
// education.doi_lookup — CrossRef (DOI resolution and metadata)
// ---------------------------------------------------------------------------

const educationDoiLookup = z
  .object({
    doi: z
      .string()
      .min(3)
      .max(200)
      .describe('DOI to resolve (e.g. "10.1038/nature12373", "10.1145/3292500.3330648").'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const educationSchemas: Record<string, ZodSchema> = {
  'education.paper_search': educationPaperSearch,
  'education.paper_details': educationPaperDetails,
  'education.college_search': educationCollegeSearch,
  'education.college_details': educationCollegeDetails,
  'education.pubmed_search': educationPubmedSearch,
  'education.arxiv_search': educationArxivSearch,
  'education.doi_lookup': educationDoiLookup,
};
