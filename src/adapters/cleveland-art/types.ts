export interface CmaArtworkImage {
  url: string;
  width: string;
  height: string;
  filesize: string;
  filename: string;
}

export interface CmaArtworkImages {
  web?: CmaArtworkImage;
  print?: CmaArtworkImage;
  full?: CmaArtworkImage;
}

export interface CmaCreatorRef {
  id: number;
  description: string;
  role: string;
  qualifier: string | null;
  birth_year: string | null;
  death_year: string | null;
}

export interface CmaArtwork {
  id: number;
  accession_number: string;
  title: string;
  tombstone: string;
  type: string;
  department: string;
  collection: string;
  creation_date: string | null;
  culture: string;
  technique: string;
  copyright: string | null;
  description: string | null;
  creditline: string | null;
  url: string;
  images: CmaArtworkImages | null;
  creators: CmaCreatorRef[];
  is_highlight: boolean;
  on_loan: boolean;
  recently_acquired: boolean;
  measurements: string | null;
  current_location: string | null;
  share_license_status: string;
}

export interface CmaArtworkSearchOutput {
  total: number;
  results: Array<{
    id: number;
    accession_number: string;
    title: string;
    type: string;
    department: string;
    creation_date: string | null;
    culture: string;
    technique: string;
    creators: string[];
    image_url: string | null;
    url: string;
    is_highlight: boolean;
  }>;
}

export interface CmaArtworkDetailOutput {
  id: number;
  accession_number: string;
  title: string;
  tombstone: string;
  type: string;
  department: string;
  collection: string;
  creation_date: string | null;
  culture: string;
  technique: string;
  measurements: string | null;
  description: string | null;
  creditline: string | null;
  copyright: string | null;
  current_location: string | null;
  is_highlight: boolean;
  on_loan: boolean;
  creators: Array<{
    id: number;
    description: string;
    role: string;
    birth_year: string | null;
    death_year: string | null;
  }>;
  images: {
    web: string | null;
    print: string | null;
    full: string | null;
  };
  url: string;
  share_license_status: string;
}

export interface CmaCreator {
  id: number;
  name: string;
  nationality: string;
  description: string;
  biography: string | null;
  birth_year: string | null;
  death_year: string | null;
  artworks: Array<{
    id: number;
    accession_number: string;
    title: string;
  }>;
}

export interface CmaCreatorSearchOutput {
  total: number;
  results: Array<{
    id: number;
    name: string;
    nationality: string;
    description: string;
    birth_year: string | null;
    death_year: string | null;
    artwork_count: number;
  }>;
}

export interface CmaExhibition {
  id: number;
  title: string;
  organizer: string;
  opening_date: string | null;
  closing_date: string | null;
  venues: Array<{
    name: string;
    start_date: string | null;
    end_date: string | null;
  }>;
  is_venue_cma: boolean;
}

export interface CmaExhibitionSearchOutput {
  total: number;
  results: Array<{
    id: number;
    title: string;
    organizer: string;
    opening_date: string | null;
    closing_date: string | null;
    venues: Array<{
      name: string;
      start_date: string | null;
      end_date: string | null;
    }>;
    is_venue_cma: boolean;
  }>;
}
