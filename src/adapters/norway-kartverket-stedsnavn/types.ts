/** Kartverket Stedsnavn (Norwegian Place Names) API raw response types (UC-681). */

export interface StedsnavnFylke {
  fylkesnavn: string;
  fylkesnummer: string;
}

export interface StedsnavnKommune {
  kommunenavn: string;
  kommunenummer: string;
}

export interface StedsnavnPunkt {
  nord: number;
  øst: number;
  koordsys?: number;
}

export interface StedsnavnNavneform {
  skrivemåte: string;
  skrivemåtestatus: string;
  navnestatus: string;
  språk?: string;
  stedsnavnnummer?: number;
}

/** A single hit from GET /navn — one written form of a named place. */
export interface StedsnavnNavnHit {
  stedsnummer: number;
  stedstatus: string;
  navneobjekttype: string;
  skrivemåte: string;
  skrivemåtestatus: string;
  navnestatus: string;
  språk?: string;
  fylker?: StedsnavnFylke[];
  kommuner?: StedsnavnKommune[];
  representasjonspunkt?: StedsnavnPunkt;
}

/** A single hit from GET /sted — full place record, one or more written forms + geometry. */
export interface StedsnavnStedHit {
  stedsnummer: number;
  stedstatus: string;
  navneobjekttype: string;
  fylker?: StedsnavnFylke[];
  kommuner?: StedsnavnKommune[];
  representasjonspunkt?: StedsnavnPunkt;
  stedsnavn?: StedsnavnNavneform[];
  oppdateringsdato?: string;
  geojson?: { geometry?: { type: string; coordinates: unknown } };
}

export interface StedsnavnMetadata {
  side: number;
  sokeStreng: string;
  totaltAntallTreff: number;
  treffPerSide: number;
  viserFra: number;
  viserTil: number;
}

export interface StedsnavnNavnResponse {
  metadata: StedsnavnMetadata;
  navn: StedsnavnNavnHit[];
}

export interface StedsnavnStedResponse {
  metadata: StedsnavnMetadata;
  navn: StedsnavnStedHit[];
}
