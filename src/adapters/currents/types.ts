/** Currents API response types (UC-210). */

export interface CurrentsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  author: string;
  image: string;
  language: string;
  category: string[];
  published: string;
}

export interface CurrentsResponse {
  status: string;
  news: CurrentsArticle[];
  page: number;
}

export interface CurrentsCategoriesResponse {
  categories: string[];
}
