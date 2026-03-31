/** Remotive API raw response types (UC-258). */

export interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo_url: string | null;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

export interface RemotiveRawResponse {
  'job-count': number;
  'total-job-count': number;
  jobs: RemotiveJob[];
}

export interface RemotiveSearchOutput {
  jobs: {
    id: number;
    title: string;
    company: string;
    category: string;
    job_type: string;
    salary: string;
    location_requirement: string;
    tags: string[];
    posted: string;
    url: string;
  }[];
  count: number;
  total: number;
}
