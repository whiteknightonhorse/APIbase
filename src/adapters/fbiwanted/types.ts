/**
 * FBI Wanted API raw response types (UC-738).
 * https://www.fbi.gov/wanted/api
 */

export interface FbiWantedImage {
  large: string | null;
  thumb: string | null;
  original: string | null;
  caption: string | null;
}

export interface FbiWantedFile {
  url: string;
  name: string;
}

export interface FbiWantedItem {
  uid: string;
  title: string;
  description: string | null;
  caution: string | null;
  remarks: string | null;
  details: string | null;
  warning_message: string | null;
  reward_text: string | null;
  status: string | null;
  poster_classification: string | null;
  person_classification: string | null;
  subjects: string[] | null;
  aliases: string[] | null;
  field_offices: string[] | null;
  publication: string | null;
  modified: string | null;
  sex: string | null;
  race: string | null;
  race_raw: string | null;
  nationality: string | null;
  hair: string | null;
  eyes: string | null;
  build: string | null;
  complexion: string | null;
  age_min: number | null;
  age_max: number | null;
  age_range: string | null;
  height_min: number | null;
  height_max: number | null;
  weight_min: number | null;
  weight_max: number | null;
  weight: string | null;
  scars_and_marks: string | null;
  dates_of_birth_used: string[] | null;
  locations: string[] | null;
  occupations: string[] | null;
  languages: string[] | null;
  url: string | null;
  images: FbiWantedImage[] | null;
  files: FbiWantedFile[] | null;
}

export interface FbiWantedListResponse {
  total: number;
  page: number;
  items: FbiWantedItem[];
}
