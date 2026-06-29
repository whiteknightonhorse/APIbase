import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SdmxJsonResponse,
  SdmxDimension,
  FaoObservation,
  FaoFoodSecurityOutput,
  FaoFoodInsecurityOutput,
  FaoWaterStressOutput,
  FaoForestAreaOutput,
  FaoFoodLossOutput,
  FaoFoodLossEntry,
} from './types';

const FAO_BASE = 'https://nsi-release-ro-statsuite.fao.org/rest';

// ISO 3166-1 alpha-2 → numeric (zero-padded 3-digit string)
const ISO2_TO_NUMERIC: Record<string, string> = {
  AF: '004',
  AL: '008',
  DZ: '012',
  AD: '020',
  AO: '024',
  AG: '028',
  AR: '032',
  AM: '051',
  AU: '036',
  AT: '040',
  AZ: '031',
  BS: '044',
  BH: '048',
  BD: '050',
  BB: '052',
  BY: '112',
  BE: '056',
  BZ: '084',
  BJ: '204',
  BT: '064',
  BO: '068',
  BA: '070',
  BW: '072',
  BR: '076',
  BN: '096',
  BG: '100',
  BF: '854',
  BI: '108',
  CV: '132',
  KH: '116',
  CM: '120',
  CA: '124',
  CF: '140',
  TD: '148',
  CL: '152',
  CN: '156',
  CO: '170',
  KM: '174',
  CG: '178',
  CD: '180',
  CR: '188',
  HR: '191',
  CU: '192',
  CY: '196',
  CZ: '203',
  DK: '208',
  DJ: '262',
  DM: '212',
  DO: '214',
  EC: '218',
  EG: '818',
  SV: '222',
  GQ: '226',
  ER: '232',
  EE: '233',
  SZ: '748',
  ET: '231',
  FJ: '242',
  FI: '246',
  FR: '250',
  GA: '266',
  GM: '270',
  GE: '268',
  DE: '276',
  GH: '288',
  GR: '300',
  GD: '308',
  GT: '320',
  GN: '324',
  GW: '624',
  GY: '328',
  HT: '332',
  HN: '340',
  HU: '348',
  IS: '352',
  IN: '356',
  ID: '360',
  IR: '364',
  IQ: '368',
  IE: '372',
  IL: '376',
  IT: '380',
  JM: '388',
  JP: '392',
  JO: '400',
  KZ: '398',
  KE: '404',
  KI: '296',
  KW: '414',
  KG: '417',
  LA: '418',
  LV: '428',
  LB: '422',
  LS: '426',
  LR: '430',
  LY: '434',
  LI: '438',
  LT: '440',
  LU: '442',
  MG: '450',
  MW: '454',
  MY: '458',
  MV: '462',
  ML: '466',
  MT: '470',
  MH: '584',
  MR: '478',
  MU: '480',
  MX: '484',
  FM: '583',
  MD: '498',
  MC: '492',
  MN: '496',
  ME: '499',
  MA: '504',
  MZ: '508',
  MM: '104',
  NA: '516',
  NR: '520',
  NP: '524',
  NL: '528',
  NZ: '554',
  NI: '558',
  NE: '562',
  NG: '566',
  MK: '807',
  NO: '578',
  OM: '512',
  PK: '586',
  PW: '585',
  PA: '591',
  PG: '598',
  PY: '600',
  PE: '604',
  PH: '608',
  PL: '616',
  PT: '620',
  QA: '634',
  RO: '642',
  RU: '643',
  RW: '646',
  KN: '659',
  LC: '662',
  VC: '670',
  WS: '882',
  ST: '678',
  SA: '682',
  SN: '686',
  RS: '688',
  SC: '690',
  SL: '694',
  SG: '702',
  SK: '703',
  SI: '705',
  SB: '090',
  SO: '706',
  ZA: '710',
  SS: '728',
  ES: '724',
  LK: '144',
  SD: '729',
  SR: '740',
  SE: '752',
  CH: '756',
  SY: '760',
  TW: '158',
  TJ: '762',
  TZ: '834',
  TH: '764',
  TL: '626',
  TG: '768',
  TO: '776',
  TT: '780',
  TN: '788',
  TR: '792',
  TM: '795',
  UG: '800',
  UA: '804',
  AE: '784',
  GB: '826',
  US: '840',
  UY: '858',
  UZ: '860',
  VU: '548',
  VE: '862',
  VN: '704',
  YE: '887',
  ZM: '894',
  ZW: '716',
};

// ISO 3166-1 alpha-3 → alpha-2 (for 3-letter code support)
const ISO3_TO_ISO2: Record<string, string> = {
  AFG: 'AF',
  ALB: 'AL',
  DZA: 'DZ',
  AND: 'AD',
  AGO: 'AO',
  ATG: 'AG',
  ARG: 'AR',
  ARM: 'AM',
  AUS: 'AU',
  AUT: 'AT',
  AZE: 'AZ',
  BHS: 'BS',
  BHR: 'BH',
  BGD: 'BD',
  BRB: 'BB',
  BLR: 'BY',
  BEL: 'BE',
  BLZ: 'BZ',
  BEN: 'BJ',
  BTN: 'BT',
  BOL: 'BO',
  BIH: 'BA',
  BWA: 'BW',
  BRA: 'BR',
  BRN: 'BN',
  BGR: 'BG',
  BFA: 'BF',
  BDI: 'BI',
  CPV: 'CV',
  KHM: 'KH',
  CMR: 'CM',
  CAN: 'CA',
  CAF: 'CF',
  TCD: 'TD',
  CHL: 'CL',
  CHN: 'CN',
  COL: 'CO',
  COM: 'KM',
  COG: 'CG',
  COD: 'CD',
  CRI: 'CR',
  HRV: 'HR',
  CUB: 'CU',
  CYP: 'CY',
  CZE: 'CZ',
  DNK: 'DK',
  DJI: 'DJ',
  DMA: 'DM',
  DOM: 'DO',
  ECU: 'EC',
  EGY: 'EG',
  SLV: 'SV',
  GNQ: 'GQ',
  ERI: 'ER',
  EST: 'EE',
  SWZ: 'SZ',
  ETH: 'ET',
  FJI: 'FJ',
  FIN: 'FI',
  FRA: 'FR',
  GAB: 'GA',
  GMB: 'GM',
  GEO: 'GE',
  DEU: 'DE',
  GHA: 'GH',
  GRC: 'GR',
  GRD: 'GD',
  GTM: 'GT',
  GIN: 'GN',
  GNB: 'GW',
  GUY: 'GY',
  HTI: 'HT',
  HND: 'HN',
  HUN: 'HU',
  ISL: 'IS',
  IND: 'IN',
  IDN: 'ID',
  IRN: 'IR',
  IRQ: 'IQ',
  IRL: 'IE',
  ISR: 'IL',
  ITA: 'IT',
  JAM: 'JM',
  JPN: 'JP',
  JOR: 'JO',
  KAZ: 'KZ',
  KEN: 'KE',
  KIR: 'KI',
  KWT: 'KW',
  KGZ: 'KG',
  LAO: 'LA',
  LVA: 'LV',
  LBN: 'LB',
  LSO: 'LS',
  LBR: 'LR',
  LBY: 'LY',
  LIE: 'LI',
  LTU: 'LT',
  LUX: 'LU',
  MDG: 'MG',
  MWI: 'MW',
  MYS: 'MY',
  MDV: 'MV',
  MLI: 'ML',
  MLT: 'MT',
  MHL: 'MH',
  MRT: 'MR',
  MUS: 'MU',
  MEX: 'MX',
  FSM: 'FM',
  MDA: 'MD',
  MCO: 'MC',
  MNG: 'MN',
  MNE: 'ME',
  MAR: 'MA',
  MOZ: 'MZ',
  MMR: 'MM',
  NAM: 'NA',
  NRU: 'NR',
  NPL: 'NP',
  NLD: 'NL',
  NZL: 'NZ',
  NIC: 'NI',
  NER: 'NE',
  NGA: 'NG',
  MKD: 'MK',
  NOR: 'NO',
  OMN: 'OM',
  PAK: 'PK',
  PLW: 'PW',
  PAN: 'PA',
  PNG: 'PG',
  PRY: 'PY',
  PER: 'PE',
  PHL: 'PH',
  POL: 'PL',
  PRT: 'PT',
  QAT: 'QA',
  ROU: 'RO',
  RUS: 'RU',
  RWA: 'RW',
  KNA: 'KN',
  LCA: 'LC',
  VCT: 'VC',
  WSM: 'WS',
  STP: 'ST',
  SAU: 'SA',
  SEN: 'SN',
  SRB: 'RS',
  SYC: 'SC',
  SLE: 'SL',
  SGP: 'SG',
  SVK: 'SK',
  SVN: 'SI',
  SLB: 'SB',
  SOM: 'SO',
  ZAF: 'ZA',
  SSD: 'SS',
  ESP: 'ES',
  LKA: 'LK',
  SDN: 'SD',
  SUR: 'SR',
  SWE: 'SE',
  CHE: 'CH',
  SYR: 'SY',
  TWN: 'TW',
  TJK: 'TJ',
  TZA: 'TZ',
  THA: 'TH',
  TLS: 'TL',
  TGO: 'TG',
  TON: 'TO',
  TTO: 'TT',
  TUN: 'TN',
  TUR: 'TR',
  TKM: 'TM',
  UGA: 'UG',
  UKR: 'UA',
  ARE: 'AE',
  GBR: 'GB',
  USA: 'US',
  URY: 'UY',
  UZB: 'UZ',
  VUT: 'VU',
  VEN: 'VE',
  VNM: 'VN',
  YEM: 'YE',
  ZMB: 'ZM',
  ZWE: 'ZW',
};

function resolveAreaCode(code: string): string | null {
  const upper = code.trim().toUpperCase();
  // Already numeric (1-3 digits)
  if (/^\d{1,3}$/.test(upper)) return upper.padStart(3, '0');
  // ISO Alpha-2
  if (ISO2_TO_NUMERIC[upper]) return ISO2_TO_NUMERIC[upper];
  // ISO Alpha-3
  const alpha2 = ISO3_TO_ISO2[upper];
  if (alpha2 && ISO2_TO_NUMERIC[alpha2]) return ISO2_TO_NUMERIC[alpha2];
  return null;
}

// Parse SDMX-JSON (application/json format) observations into array
function parseObservations(
  seriesKey: string,
  seriesData: { observations: Record<string, (string | number | null)[]> },
  timeDim: { values: { id: string; name: string }[] },
): FaoObservation[] {
  return Object.entries(seriesData.observations)
    .map(([timeIdx, obs]) => {
      const year = timeDim.values[parseInt(timeIdx, 10)]?.name ?? timeIdx;
      const raw = obs[0];
      if (raw === '' || raw === null || raw === undefined) {
        return { year, value: null };
      }
      return { year, value: typeof raw === 'number' ? raw : parseFloat(String(raw)) };
    })
    .filter((o) => o.value !== null)
    .sort((a, b) => b.year.localeCompare(a.year));
}

// Extract dimension value name by index from series key
function getDimValue(
  dims: SdmxDimension[],
  dimIdx: number,
  valIdx: number,
): SdmxDimension['values'][0] {
  return dims[dimIdx]?.values[valIdx] ?? { id: '', name: '' };
}

export class FaoAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'faostat', baseUrl: FAO_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    const startPeriod = p.start_year ? `&startPeriod=${p.start_year}` : '&startPeriod=2015';
    const endPeriod = p.end_year ? `&endPeriod=${p.end_year}` : '';

    switch (req.toolId) {
      case 'faostat.food_security': {
        const area = resolveAreaCode(String(p.country_code ?? ''));
        if (!area) throw this.badParam('Invalid country_code', req.toolId);
        // + is SDMX OR operator — must NOT be percent-encoded in path
        const key = `A.SN_ITK_DEFC+SN_ITK_DEFCN.${area}._T._T._T._T._T.PT+NO._T._T._T`;
        return {
          url: `${FAO_BASE}/data/FAO,DF_SDG_2_1_1,1.0/${key}?detail=dataonly${startPeriod}${endPeriod}`,
          method: 'GET',
          headers,
        };
      }

      case 'faostat.food_insecurity': {
        const area = resolveAreaCode(String(p.country_code ?? ''));
        if (!area) throw this.badParam('Invalid country_code', req.toolId);
        const key = `A.AG_PRD_FIESMS+AG_PRD_FIESS.${area}._T._T._T._T._T.PT._T._T._T`;
        return {
          url: `${FAO_BASE}/data/FAO,DF_SDG_2_1_2,1.0/${key}?detail=dataonly${startPeriod}${endPeriod}`,
          method: 'GET',
          headers,
        };
      }

      case 'faostat.water_stress': {
        const area = resolveAreaCode(String(p.country_code ?? ''));
        if (!area) throw this.badParam('Invalid country_code', req.toolId);
        const key = `A.ER_H2O_STRESS.${area}._T._T._T._T._T.PT._T._T._T`;
        return {
          url: `${FAO_BASE}/data/FAO,DF_SDG_6_4_2,1.0/${key}?detail=dataonly${startPeriod}${endPeriod}`,
          method: 'GET',
          headers,
        };
      }

      case 'faostat.forest_area': {
        const area = resolveAreaCode(String(p.country_code ?? ''));
        if (!area) throw this.badParam('Invalid country_code', req.toolId);
        const key = `A.AG_LND_FRST+AG_LND_FRSTN.${area}._T._T._T._T._T.PT+HA._T._T._T`;
        return {
          url: `${FAO_BASE}/data/FAO,DF_SDG_15_1_1,1.0/${key}?detail=dataonly${startPeriod}${endPeriod}`,
          method: 'GET',
          headers,
        };
      }

      case 'faostat.food_loss': {
        const yearParam = p.year
          ? `&startPeriod=${p.year}&endPeriod=${p.year}`
          : `${startPeriod}${endPeriod}`;
        return {
          url: `${FAO_BASE}/data/FAO,DF_SDG_12_3_1,1.0?detail=dataonly${yearParam}`,
          method: 'GET',
          headers,
        };
      }

      default:
        throw this.badParam(`Unsupported tool: ${req.toolId}`, req.toolId);
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as SdmxJsonResponse;
    if (!body?.dataSets?.[0] || !body.structure) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'FAOSTAT returned invalid SDMX-JSON response',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    const params = req.params as Record<string, unknown>;
    const ds = body.dataSets[0];
    const struct = body.structure;
    const dims = struct.dimensions.series;
    const timeDim = struct.dimensions.observation[0];

    switch (req.toolId) {
      case 'faostat.food_security': {
        const area = resolveAreaCode(String(params.country_code)) ?? '';
        const prevalence: FaoObservation[] = [];
        const count: FaoObservation[] = [];

        for (const [key, sd] of Object.entries(ds.series)) {
          const parts = key.split(':').map(Number);
          const seriesDim = getDimValue(dims, 1, parts[1]);
          const obs = parseObservations(key, sd, timeDim);
          if (seriesDim.id === 'SN_ITK_DEFC') prevalence.push(...obs);
          else if (seriesDim.id === 'SN_ITK_DEFCN') count.push(...obs);
        }

        const countryName = this.getCountryName(dims, ds);
        const result: FaoFoodSecurityOutput = {
          country: countryName || area,
          country_code: area,
          indicator: 'undernourishment',
          prevalence_pct: prevalence,
          count_millions: count,
          source: 'FAO FAOSTAT — SDG Indicator 2.1.1',
        };
        return result;
      }

      case 'faostat.food_insecurity': {
        const area = resolveAreaCode(String(params.country_code)) ?? '';
        const moderateSevere: FaoObservation[] = [];
        const severe: FaoObservation[] = [];

        for (const [key, sd] of Object.entries(ds.series)) {
          const parts = key.split(':').map(Number);
          const seriesDim = getDimValue(dims, 1, parts[1]);
          const obs = parseObservations(key, sd, timeDim);
          if (seriesDim.id === 'AG_PRD_FIESMS') moderateSevere.push(...obs);
          else if (seriesDim.id === 'AG_PRD_FIESS') severe.push(...obs);
        }

        const countryName = this.getCountryName(dims, ds);
        const result: FaoFoodInsecurityOutput = {
          country: countryName || area,
          country_code: area,
          indicator: 'food_insecurity',
          moderate_or_severe_pct: moderateSevere,
          moderate_or_severe_millions: [],
          severe_pct: severe,
          source: 'FAO FAOSTAT — SDG Indicator 2.1.2',
        };
        return result;
      }

      case 'faostat.water_stress': {
        const area = resolveAreaCode(String(params.country_code)) ?? '';
        const withdrawal: FaoObservation[] = [];

        for (const [key, sd] of Object.entries(ds.series)) {
          // Only include total (ACTIVITY=_T), which is position 5
          const parts = key.split(':').map(Number);
          const activityDim = getDimValue(dims, 5, parts[5]);
          if (activityDim.id === '_T') {
            withdrawal.push(...parseObservations(key, sd, timeDim));
          }
        }

        const countryName = this.getCountryName(dims, ds);
        const result: FaoWaterStressOutput = {
          country: countryName || area,
          country_code: area,
          indicator: 'water_stress',
          freshwater_withdrawal_pct: withdrawal,
          source: 'FAO FAOSTAT — SDG Indicator 6.4.2',
        };
        return result;
      }

      case 'faostat.forest_area': {
        const area = resolveAreaCode(String(params.country_code)) ?? '';
        const pct: FaoObservation[] = [];
        const ha: FaoObservation[] = [];

        for (const [key, sd] of Object.entries(ds.series)) {
          const parts = key.split(':').map(Number);
          const seriesDim = getDimValue(dims, 1, parts[1]);
          const obs = parseObservations(key, sd, timeDim);
          if (seriesDim.id === 'AG_LND_FRST') pct.push(...obs);
          else if (seriesDim.id === 'AG_LND_FRSTN') ha.push(...obs);
        }

        const countryName = this.getCountryName(dims, ds);
        const result: FaoForestAreaOutput = {
          country: countryName || area,
          country_code: area,
          indicator: 'forest_area',
          forest_pct_of_land: pct,
          forest_ha: ha,
          source: 'FAO FAOSTAT — SDG Indicator 15.1.1',
        };
        return result;
      }

      case 'faostat.food_loss': {
        const results: FaoFoodLossEntry[] = [];
        const entryMap = new Map<string, FaoFoodLossEntry>();

        for (const [key, sd] of Object.entries(ds.series)) {
          const parts = key.split(':').map(Number);
          const areaDim = getDimValue(dims, 2, parts[2]);
          const seriesDim = getDimValue(dims, 1, parts[1]);
          const productDim = getDimValue(dims, 6, parts[6]);

          const entryKey = `${areaDim.id}:${productDim.id}`;
          if (!entryMap.has(entryKey)) {
            entryMap.set(entryKey, {
              area: areaDim.name,
              area_code: areaDim.id,
              product: productDim.name,
              product_code: productDim.id,
              loss_pct: [],
              loss_index: [],
            });
          }
          const entry = entryMap.get(entryKey);
          if (!entry) continue;
          const obs = parseObservations(key, sd, timeDim);
          if (seriesDim.id === 'AG_FLS_PCT') entry.loss_pct.push(...obs);
          else if (seriesDim.id === 'AG_FLS_INDEX') entry.loss_index.push(...obs);
        }

        results.push(...entryMap.values());
        const result: FaoFoodLossOutput = {
          indicator: 'food_loss',
          year_range: `${params.year ?? '2015–2022'}`,
          results,
          source: 'FAO FAOSTAT — SDG Indicator 12.3.1',
        };
        return result;
      }

      default:
        return body;
    }
  }

  private getCountryName(dims: SdmxDimension[], ds: SdmxJsonResponse['dataSets'][0]): string {
    const keys = Object.keys(ds.series);
    if (!keys.length) return '';
    const parts = keys[0].split(':').map(Number);
    const areaDim = dims[2]; // REF_AREA is always at keyPosition 2
    return areaDim?.values[parts[2]]?.name ?? '';
  }

  private badParam(msg: string, toolId: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message: msg,
      provider: this.provider,
      toolId,
      durationMs: 0,
    };
  }
}
