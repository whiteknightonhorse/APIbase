/**
 * Parsed feature from the USGS MRDS WFS `mrds` layer (GML 3.2 response,
 * regex-extracted since the layer only supports GML/XML output — no JSON).
 */
export interface MrdsFeature {
  dep_id: string;
  site_name: string;
  dev_status: string;
  commodities: string[];
  fips_code: string;
  huc_code: string;
  quad_code: string;
  latitude: number | null;
  longitude: number | null;
  detail_url: string;
}
