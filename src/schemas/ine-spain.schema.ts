import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// Shared operation-code enum — the 109 published statistical-operation codes
// (INE "Codigo" field) as of the live OPERACIONES_DISPONIBLES catalog. This is
// a small, rarely-changing closed set, so it is enum-constrained: an unknown
// code makes the upstream TABLAS_OPERACION endpoint return HTTP 200 with an
// EMPTY body (not an error), which would otherwise surface as a confusing
// "invalid JSON" 502 instead of a clear input-validation error.
// ---------------------------------------------------------------------------
const INE_OPERATION_CODES = [
  'ADRH',
  'ANES',
  'APEL',
  'CCM',
  'CDMGE',
  'CMEA',
  'CNE',
  'CNEAG',
  'CNTR2000',
  'CNTR2008',
  'CNTR2010',
  'CODEM',
  'CONA',
  'CONM',
  'CP',
  'CTNFSI',
  'DIR',
  'DPOD',
  'DPOH',
  'DPOP',
  'EACL',
  'EAES',
  'EAES:Q',
  'ECM',
  'ECP',
  'ECSE',
  'ECV',
  'ECVG',
  'EDES',
  'EEE:COM',
  'EEE:IND',
  'EEE:SER',
  'EFPA',
  'EG',
  'EH',
  'EI',
  'EIAP',
  'EJP',
  'EM',
  'EMCR',
  'EMLG',
  'EMN',
  'ENSD',
  'EOA',
  'EOAC',
  'EOAP',
  'EOH',
  'EOT',
  'EOTR',
  'EPA',
  'EPC',
  'EPF',
  'EPOBA',
  'EPOBC',
  'EPOBL',
  'ETCL',
  'ETDP',
  'ETR',
  'FR',
  'GDRE',
  'GDVE',
  'HPT',
  'IAS',
  'ICE',
  'ICES',
  'ICLA',
  'ICM',
  'ICN',
  'ICNE',
  'IDB',
  'IEP',
  'IGC',
  'IIH',
  'IMCV',
  'IMM',
  'IPAC',
  'IPAP',
  'IPC',
  'IPCA',
  'IPCO',
  'IPH',
  'IPI',
  'IPRI',
  'IPRX-M',
  'IPS',
  'IPSS',
  'IPT',
  'IPTR',
  'IPV',
  'IPVA',
  'IRSH',
  'MMOV',
  'MNPD',
  'MNPM',
  'MNPN',
  'MOS',
  'MYH',
  'OAT',
  'PERE',
  'SM',
  'STEC',
  'TF',
  'TM',
  'TMOV',
  'TNOM',
  'TV',
  'UA',
  'VGD',
  'VTE',
] as const;

const ineLang = z
  .enum(['ES', 'EN'])
  .optional()
  .describe('Response language: ES (Spanish, default) or EN (English).');

// ---------------------------------------------------------------------------
// ine-spain.operations — browse the catalog of published statistical operations
// ---------------------------------------------------------------------------

const ineSpainOperations = z
  .object({
    search: z
      .string()
      .optional()
      .describe(
        'Case-insensitive substring to filter operations by name, e.g. "precios" or "population". Omit to list all 109 published operations.',
      ),
    lang: ineLang,
  })
  .strip();

// ---------------------------------------------------------------------------
// ine-spain.tables — list tables published under one statistical operation
// ---------------------------------------------------------------------------

const ineSpainTables = z
  .object({
    operation_code: z
      .enum(INE_OPERATION_CODES)
      .describe(
        'Operation code from ine-spain.operations, e.g. "IPC" (Consumer Price Index) or "EPA" (Labour Force Survey).',
      ),
    lang: ineLang,
  })
  .strip();

// ---------------------------------------------------------------------------
// ine-spain.table_data — most-recent data points across every series in a table
// ---------------------------------------------------------------------------

const ineSpainTableData = z
  .object({
    table_id: z
      .number()
      .int()
      .describe(
        'Numeric table id from ine-spain.tables, e.g. 24077 for the national CPI index table.',
      ),
    periods: z
      .number()
      .int()
      .min(1)
      .max(6)
      .optional()
      .describe(
        'Number of most-recent periods to return per series, 1-6 (default 1). Tables can bundle hundreds of series, so this is capped tightly to stay under the response size limit — use ine-spain.series_data for a longer single-series history.',
      ),
    lang: ineLang,
  })
  .strip();

// ---------------------------------------------------------------------------
// ine-spain.series_data — data points + rich metadata for one specific series
// ---------------------------------------------------------------------------

const ineSpainSeriesData = z
  .object({
    series_code: z
      .string()
      .min(1)
      .describe(
        'Series code, e.g. "IPC251856" (from a table_data result COD field, or the INE website). An unrecognized code returns an empty response.',
      ),
    periods: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of most-recent periods to return, 1-100 (default 12).'),
    lang: ineLang,
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const ineSpainSchemas: Record<string, ZodSchema> = {
  'ine-spain.operations': ineSpainOperations,
  'ine-spain.tables': ineSpainTables,
  'ine-spain.table_data': ineSpainTableData,
  'ine-spain.series_data': ineSpainSeriesData,
};
