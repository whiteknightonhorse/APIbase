/** Raw ArcGIS FeatureServer response for NBI bridge records */
export interface NbiFeature {
  attributes: NbiBridgeAttributes;
  geometry?: { x: number; y: number };
}

export interface NbiBridgeAttributes {
  fid: number;
  state_code: string;
  structure_: string;
  location_0: string;
  features_d: string;
  facility_c: string;
  county_cod: string;
  place_code: string;
  year_built: number;
  year_recon: number;
  bridge_con: string;
  deck_cond_: string;
  superstruc: string;
  substructu: string;
  structural: string;
  channel_co: string;
  culvert_co: string;
  operating_: number;
  inventory_: number;
  max_span_l: number;
  deck_width: number;
  main_unit_: number;
  appr_spans: number;
  adt_029: number;
  year_adt_0: number;
  future_adt: number;
  year_of_fu: number;
  open_close: string;
  lowest_rat: number;
  scour_crit: string;
  latdd: number;
  longdd: number;
  owner_022: string;
  maintenanc: string;
  functional: string;
  design_loa: string;
  deck_struc: string;
  surface_ty: string;
  deck_area: number;
  bridge_imp: number;
  roadway_im: number;
  total_imp_: number;
  year_of_im: number;
  inspect_fr: number;
  date_of_in: string;
  date: string;
  status: string;
  fracture_0: string;
  spec_inspe: string;
  posting_ev: string;
  toll_020: string;
  temp_struc: string;
  fed_agency: string;
  degrees_sk: number;
  traffic_la: string;
  service_on: string;
  service_un: string;
}

export interface NbiQueryResponse {
  features?: NbiFeature[];
  error?: { code: number; message: string };
  count?: number;
  exceededTransferLimit?: boolean;
}

export interface NbiStatisticsResponse {
  features?: Array<{ attributes: { count: number; bridge_con: string } }>;
  error?: { code: number; message: string };
}
