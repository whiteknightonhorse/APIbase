/** Jooble API raw response types (UC-255). */

export interface JoobleJob {
  title: string;
  location: string;
  snippet: string;
  salary: string;
  source: string;
  type: string;
  link: string;
  company: string;
  updated: string;
  id: number;
}

export interface JoobleRawResponse {
  totalCount: number;
  jobs: JoobleJob[];
}

export interface JoobleSearchOutput {
  jobs: {
    title: string;
    company: string;
    location: string;
    salary: string;
    type: string;
    source: string;
    url: string;
    posted: string;
  }[];
  total: number;
  count: number;
}
