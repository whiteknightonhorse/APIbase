/** PDOK Kadaster Kadastrale Kaart OGC API Features raw response types (UC-680). */

export interface PdokGeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

export interface PdokGeoJsonFeature<P> {
  type: 'Feature';
  id?: string;
  properties: P;
  geometry?: PdokGeoJsonGeometry | null;
}

export interface PdokFeatureCollection<P> {
  type: 'FeatureCollection';
  numberReturned?: number;
  numberMatched?: number;
  features: Array<PdokGeoJsonFeature<P>>;
}

export interface PdokPerceelProperties {
  identificatie_lokaal_id?: string;
  identificatie_namespace?: string;
  kadastrale_gemeente_code?: string;
  kadastrale_gemeente_waarde?: string;
  sectie?: string;
  perceelnummer?: number;
  kadastrale_grootte_waarde?: number;
  soort_grootte_waarde?: string;
  status_historie_waarde?: string;
  begin_geldigheid?: string;
  tijdstip_registratie?: string;
}

export interface PdokBebouwingProperties {
  identificatie_lokaal_id?: string;
  identificatie_namespace?: string;
  identificatie_bag_pnd?: string;
  bgt_status?: string;
  bronhouder?: string;
  relatieve_hoogteligging?: number;
  object_begin_tijd?: string;
  tijdstip_registratie?: string;
  lv_publicatiedatum?: string;
}
