export interface MedlinePlusEntry {
  title: { _value: string; type: string };
  link: Array<{ href: string; rel: string }>;
  id: { _value: string };
  summary?: { type: string; _value: string };
  updated?: { _value: string };
}

export interface MedlinePlusFeed {
  base: string;
  lang: string;
  title: { type: string; _value: string };
  updated: { _value: string };
  id: { _value: string };
  author?: { name: { _value: string }; uri: { _value: string } };
  subtitle: { type: string; _value: string };
  category: Array<{ scheme: string; term: string }>;
  entry?: MedlinePlusEntry[];
}

export interface MedlinePlusResponse {
  feed: MedlinePlusFeed;
}
