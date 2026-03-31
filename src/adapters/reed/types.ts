/** Reed.co.uk API raw response types (UC-257). */

export interface ReedSearchJob {
  jobId: number;
  employerId: number;
  employerName: string;
  jobTitle: string;
  locationName: string;
  minimumSalary: number | null;
  maximumSalary: number | null;
  currency: string;
  expirationDate: string;
  date: string;
  jobDescription: string;
  applications: number;
  jobUrl: string;
}

export interface ReedSearchResponse {
  results: ReedSearchJob[];
  totalResults: number;
}

export interface ReedJobDetail {
  jobId: number;
  employerName: string;
  jobTitle: string;
  locationName: string;
  minimumSalary: number | null;
  maximumSalary: number | null;
  yearlyMinimumSalary: number | null;
  yearlyMaximumSalary: number | null;
  currency: string;
  salaryType: string;
  salary: string;
  datePosted: string;
  expirationDate: string;
  externalUrl: string | null;
  jobUrl: string;
  partTime: boolean;
  fullTime: boolean;
  contractType: string;
  jobDescription: string;
  applicationCount: number;
}

export interface ReedSearchOutput {
  jobs: {
    id: number;
    title: string;
    company: string;
    location: string;
    salary_min: number | null;
    salary_max: number | null;
    currency: string;
    posted: string;
    applications: number;
    url: string;
  }[];
  total: number;
  count: number;
}

export interface ReedDetailOutput {
  id: number;
  title: string;
  company: string;
  location: string;
  salary: string;
  salary_type: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  contract_type: string;
  full_time: boolean;
  posted: string;
  expires: string;
  applications: number;
  url: string;
  external_url: string | null;
  description: string;
}
