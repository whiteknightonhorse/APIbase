/**
 * TheirStack Job Market Intelligence types (UC-254).
 * 181M+ job postings, tech stack analysis.
 */

export interface TSJob {
  id: number;
  job_title: string;
  company: string;
  url: string;
  date_posted: string;
  location: string;
  country: string;
  country_code: string;
  remote: boolean;
  hybrid: boolean;
  min_annual_salary_usd: number | null;
  max_annual_salary_usd: number | null;
  salary_string: string | null;
}

export interface TSCompany {
  company_name: string;
  company_url: string;
  num_jobs: number;
  technologies: string[];
  country: string;
}

export interface JobsOutput {
  jobs: Array<{
    title: string;
    company: string;
    location: string;
    country: string;
    remote: boolean;
    salary_min_usd: number | null;
    salary_max_usd: number | null;
    posted: string;
    url: string;
  }>;
  count: number;
}

export interface CompaniesOutput {
  companies: Array<{
    name: string;
    url: string;
    jobs_count: number;
    technologies: string[];
    country: string;
  }>;
  count: number;
}
