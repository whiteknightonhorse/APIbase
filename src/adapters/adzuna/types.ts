/**
 * Adzuna Job Search types (UC-253).
 * Job search across 16+ countries.
 */

export interface AdzunaJob {
  id: string;
  title: string;
  description: string;
  redirect_url: string;
  salary_min: number | null;
  salary_max: number | null;
  company: { display_name: string };
  location: { display_name: string; area: string[] };
  category: { label: string; tag: string };
  created: string;
  contract_type: string | null;
  contract_time: string | null;
}

export interface AdzunaSearchResponse {
  count: number;
  results: AdzunaJob[];
  mean: number | null;
}

export interface AdzunaCategory {
  tag: string;
  label: string;
}

export interface JobSearchOutput {
  total: number;
  jobs: Array<{
    title: string;
    company: string;
    location: string;
    salary_min: number | null;
    salary_max: number | null;
    category: string;
    contract_type: string | null;
    created: string;
    url: string;
  }>;
  mean_salary: number | null;
}

export interface CategoriesOutput {
  categories: Array<{ tag: string; label: string }>;
  total: number;
}

export interface SalaryOutput {
  query: string;
  histogram: Record<string, number>;
  buckets: number;
}
