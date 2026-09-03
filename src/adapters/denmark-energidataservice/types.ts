// ---------------------------------------------------------------------------
// Raw Danish Energy Data Service API response shapes
// (api.energidataservice.dk — Energinet, the Danish TSO)
// All dataset endpoints share the same envelope: { total, filters, limit,
// dataset, records: [...] }. Field names below are exactly as returned.
// ---------------------------------------------------------------------------

export interface EdsEnvelope<T> {
  total: number;
  filters: string;
  limit: number;
  dataset: string;
  records: T[];
}

/** One row of the Elspotprices dataset (hourly day-ahead spot price). */
export interface EdsSpotPriceRaw {
  HourUTC: string;
  HourDK: string;
  PriceArea: string;
  SpotPriceDKK: number | null;
  SpotPriceEUR: number | null;
}
export type EdsSpotPricesResponse = EdsEnvelope<EdsSpotPriceRaw>;

/** One row of the CO2Emis dataset (5-minute grid carbon intensity). */
export interface EdsCo2EmisRaw {
  Minutes5UTC: string;
  Minutes5DK: string;
  PriceArea: string;
  CO2Emission: number | null;
}
export type EdsCo2EmisResponse = EdsEnvelope<EdsCo2EmisRaw>;

/** One row of the ProductionConsumptionSettlement dataset (hourly production mix + consumption). */
export interface EdsProductionConsumptionRaw {
  HourUTC: string;
  HourDK: string;
  PriceArea: string;
  CentralPowerMWh: number | null;
  LocalPowerMWh: number | null;
  OffshoreWindLt100MW_MWh: number | null;
  OffshoreWindGe100MW_MWh: number | null;
  OnshoreWindLt50kW_MWh: number | null;
  OnshoreWindGe50kW_MWh: number | null;
  HydroPowerMWh: number | null;
  SolarPowerLt10kW_MWh: number | null;
  SolarPowerGe10Lt40kW_MWh: number | null;
  SolarPowerGe40kW_MWh: number | null;
  GrossConsumptionMWh: number | null;
}
export type EdsProductionConsumptionResponse = EdsEnvelope<EdsProductionConsumptionRaw>;

// ---------------------------------------------------------------------------
// Normalized output types (what agents receive)
// ---------------------------------------------------------------------------

export interface EdsSpotPricePoint {
  hour_utc: string;
  hour_dk: string;
  price_area: string;
  spot_price_dkk_per_mwh: number | null;
  spot_price_eur_per_mwh: number | null;
}

export interface EdsSpotPricesOutput {
  count: number;
  prices: EdsSpotPricePoint[];
}

export interface EdsCo2EmisPoint {
  timestamp_utc: string;
  timestamp_dk: string;
  price_area: string;
  co2_g_per_kwh: number | null;
}

export interface EdsCo2EmissionsOutput {
  count: number;
  readings: EdsCo2EmisPoint[];
}

export interface EdsProductionConsumptionPoint {
  hour_utc: string;
  hour_dk: string;
  price_area: string;
  central_power_mwh: number | null;
  local_power_mwh: number | null;
  offshore_wind_mwh: number | null;
  onshore_wind_mwh: number | null;
  hydro_power_mwh: number | null;
  solar_power_mwh: number | null;
  gross_consumption_mwh: number | null;
}

export interface EdsProductionConsumptionOutput {
  count: number;
  records: EdsProductionConsumptionPoint[];
}
