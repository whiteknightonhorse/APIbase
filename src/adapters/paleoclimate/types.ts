// Raw response types for the NOAA NCEI Paleoclimatology study/search.json API.
// Only fields actually consumed by the adapter are declared — the upstream
// payload carries many more (contactInfo boilerplate, investigatorDetails,
// funding, scienceKeywords, ...) which are intentionally dropped when parsing.

export interface PaleoDataFile {
  fileUrl: string | null;
  urlDescription: string | null;
  linkText: string | null;
}

export interface PaleoDataTable {
  dataTableName: string | null;
  NOAADataTableId: string | null;
  earliestYear: number | null;
  mostRecentYear: number | null;
  timeUnit: string | null;
  earliestYearCE: number | null;
  mostRecentYearCE: number | null;
  coreLengthMeters: number | null;
  dataFile: PaleoDataFile[] | null;
}

export interface PaleoSiteGeoProperties {
  southernmostLatitude: string | null;
  northernmostLatitude: string | null;
  westernmostLongitude: string | null;
  easternmostLongitude: string | null;
  minElevationMeters: string | null;
  maxElevationMeters: string | null;
}

export interface PaleoSite {
  NOAASiteId: string | null;
  siteName: string | null;
  locationName: string | null;
  geo: {
    properties: PaleoSiteGeoProperties;
  } | null;
  paleoData: PaleoDataTable[] | null;
}

export interface PaleoPublication {
  author: string | null;
  pubYear: string | null;
  title: string | null;
  journal: string | null;
  doi: string | null;
}

export interface PaleoStudy {
  xmlId: string;
  NOAAStudyId: string;
  studyName: string;
  doi: string | null;
  dataPublisher: string | null;
  dataType: string;
  investigators: string | null;
  version: string | null;
  studyNotes: string | null;
  onlineResourceLink: string | null;
  earliestYearCE: number | null;
  mostRecentYearCE: number | null;
  publication: PaleoPublication[] | null;
  site: PaleoSite[] | null;
  dataLicenseUrl: string | null;
}

export interface PaleoSearchResponse {
  study?: PaleoStudy[];
  errorMessage?: string;
}
