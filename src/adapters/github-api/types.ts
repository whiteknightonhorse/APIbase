/** GitHub API raw response types (UC-332). */

export interface GitHubRepo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  updated_at: string;
  license: { spdx_id: string } | null;
  owner: { login: string; avatar_url: string };
}

export interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
  html_url: string;
  avatar_url: string;
  company: string | null;
  location: string | null;
  created_at: string;
}

export interface GitHubSearchOutput {
  repos: {
    name: string;
    description: string;
    url: string;
    stars: number;
    forks: number;
    language: string;
    topics: string[];
    updated: string;
    license: string;
    owner: string;
  }[];
  total: number;
  count: number;
}

export interface GitHubUserOutput {
  login: string;
  name: string;
  bio: string;
  repos: number;
  followers: number;
  following: number;
  url: string;
  avatar: string;
  company: string;
  location: string;
  joined: string;
}

export interface GitHubRepoOutput {
  name: string;
  description: string;
  url: string;
  stars: number;
  forks: number;
  language: string;
  topics: string[];
  license: string;
  owner: string;
  updated: string;
}
