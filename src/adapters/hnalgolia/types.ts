/** Hit returned by /api/v1/search and /api/v1/search_by_date for stories/jobs/polls */
export interface HnaStoryHit {
  objectID: string;
  title: string | null;
  url: string | null;
  author: string;
  points: number | null;
  num_comments: number | null;
  story_id: number | null;
  created_at: string;
  created_at_i: number;
  updated_at: string;
  _tags: string[];
}

/** Hit returned for comments (tags=comment) */
export interface HnaCommentHit {
  objectID: string;
  comment_text: string;
  author: string;
  story_id: number | null;
  story_title: string | null;
  story_url: string | null;
  parent_id: number | null;
  points: number | null;
  created_at: string;
  created_at_i: number;
  updated_at: string;
  _tags: string[];
}

/** Envelope returned by both search endpoints */
export interface HnaSearchResult {
  hits: (HnaStoryHit | HnaCommentHit)[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
}

/** Full item returned by /api/v1/items/{id} (may contain nested children) */
export interface HnaItem {
  id: number;
  type: 'story' | 'comment' | 'job' | 'poll' | 'pollopt';
  author: string | null;
  title: string | null;
  url: string | null;
  text: string | null;
  points: number | null;
  story_id: number | null;
  parent_id: number | null;
  created_at: string;
  created_at_i: number;
  options: unknown[];
  children: HnaItem[];
}

/** User profile returned by /api/v1/users/{username} */
export interface HnaUser {
  username: string;
  karma: number;
  about: string | null;
}
