/** Raw shapes returned by the Statistik Austria (data.statistik.gv.at) open-data portal. */

/** One dataset entry scraped from `GET web/catalog.jsp` (id + display title, no JSON catalog exists). */
export interface StatistikAustriaCatalogEntry {
  dataset_id: string;
  title: string;
}

/** `GET ogd/json?dataset={id}` — OGD Austria Metadata 2.3 shape for one dataset. */
export interface StatistikAustriaResource {
  url?: string;
  format?: string;
  name?: string;
  created?: string;
  last_modified?: string;
  language?: string;
  characterset?: string;
}

export interface StatistikAustriaMetadataExtras {
  metadata_identifier?: string;
  metadata_modified?: string;
  metadata_linkage?: string[];
  metadata_original_portal?: string;
  begin_datetime?: string | null;
  end_datetime?: string | null;
  categorization?: string[];
  schema_name?: string;
  /** Semicolon-joined `code:description` pairs for every column code, e.g.
   *  "F-VESTE_AM:Arithmetisches Mittel;...;C-STAATS-0:Staatsangehörigkeit". */
  attribute_description?: string;
  maintainer_link?: string;
  publisher?: string;
  geographic_toponym?: string;
  update_frequency?: string;
  lineage_quality?: string;
  /** English title + notes, semicolon-joined free text (not structured). */
  en_title_and_desc?: string;
  license_citation?: string;
}

export interface StatistikAustriaMetadata {
  title: string;
  notes?: string;
  tags?: string[];
  maintainer?: string;
  license?: string;
  maintainer_email?: string;
  resources?: StatistikAustriaResource[];
  extras?: StatistikAustriaMetadataExtras;
  state?: string;
}
