// Raw response shape for the geoBoundaries Open Database of Global Administrative Boundaries
// (www.geoboundaries.org/api/current/gbOpen). Maintained by William & Mary geoLab.
// Every record describes one boundary file (a country at one ADM level) with metadata
// and download links to the actual GeoJSON/TopoJSON/preview-image assets on GitHub.

export interface GeoBoundariesRecord {
  boundaryID: string;
  boundaryName: string;
  boundaryISO: string;
  boundaryYearRepresented: string;
  boundaryType: string; // e.g. "ADM0", "ADM1", "ADM2"
  boundaryCanonical: string; // local name for the admin level, e.g. "States", "Sub-Counties"
  boundarySource: string;
  boundaryLicense: string;
  licenseDetail: string;
  licenseSource: string;
  boundarySourceURL: string;
  sourceDataUpdateDate: string;
  buildDate: string;
  Continent: string;
  'UNSDG-region': string;
  'UNSDG-subregion': string;
  worldBankIncomeGroup: string;
  admUnitCount: string;
  meanVertices: string;
  minVertices: string;
  maxVertices: string;
  meanPerimeterLengthKM: string;
  minPerimeterLengthKM: string;
  maxPerimeterLengthKM: string;
  meanAreaSqKM: string;
  minAreaSqKM: string;
  maxAreaSqKM: string;
  staticDownloadLink: string;
  gjDownloadURL: string;
  tjDownloadURL: string;
  imagePreview: string;
  simplifiedGeometryGeoJSON: string;
}

// GET /{ISO3}/{ADM_LEVEL}/ returns a single object.
// GET /ALL/{ADM_LEVEL}/ or /{ISO3}/ALL/ returns an array of objects.
export type GeoBoundariesResponse = GeoBoundariesRecord | GeoBoundariesRecord[];
