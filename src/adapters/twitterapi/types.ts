/** TwitterAPI.io response types (UC-198). */

export interface TwitterUser {
  userName: string;
  name: string;
  id: string;
  followers: number;
  following: number;
  statusesCount: number;
  description: string;
  location: string;
  verified: boolean;
  isBlueVerified: boolean;
  profileImageUrl: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface TwitterTweet {
  id: string;
  text: string;
  createdAt: string;
  author: TwitterUser;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  viewCount: number;
  lang: string;
  [key: string]: unknown;
}

export interface TwitterSearchResponse {
  tweets: TwitterTweet[];
  has_next_page: boolean;
  next_cursor: string;
}

export interface TwitterTrendItem {
  trend: {
    name: string;
    target: { query: string };
    rank: number;
  };
}

export interface TwitterTrendsResponse {
  status: string;
  trends: TwitterTrendItem[];
  metadata: Record<string, unknown>;
}
