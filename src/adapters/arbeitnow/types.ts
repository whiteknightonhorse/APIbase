/** Arbeitnow API raw response types (UC-256). */

export interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: string;
}

export interface ArbeitnowRawResponse {
  data: ArbeitnowJob[];
  meta: {
    current_page: number;
    per_page: number;
    from: number;
    to: number;
  };
}

export interface ArbeitnowJobsOutput {
  jobs: {
    title: string;
    company: string;
    location: string;
    remote: boolean;
    tags: string[];
    job_types: string[];
    url: string;
    posted: string;
  }[];
  page: number;
  count: number;
}
