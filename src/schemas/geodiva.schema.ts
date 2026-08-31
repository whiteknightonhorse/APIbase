import { z, type ZodSchema } from 'zod';

const THREAT_LEVELS = [
  'Very Low Threat',
  'Low Threat',
  'Moderate Threat',
  'High Threat',
  'Very High Threat',
] as const;

const AGE_CLASSES = [
  'Historical',
  'Holocene',
  'Pleistocene',
  'SuspHist',
  'SuspHolo',
  'SuspPleist',
] as const;

/** Matches the GeoDIVA date formats: "-500", "1980", "2020-01-01", "2020-01-01T00:00:00". */
const DATE_RE = /^-?\d{1,4}(-\d{2}(-\d{2}(T\d{2}:\d{2}:\d{2})?)?)?$/;

const volcanoList = z
  .object({
    threat_level: z
      .enum(THREAT_LEVELS)
      .optional()
      .describe('Filter by NVEWS eruption-hazard threat rating (client-side filter)'),
    age_class: z
      .enum(AGE_CLASSES)
      .optional()
      .describe(
        'Filter by geologic age class — Historical/Holocene/Pleistocene, or Susp* (suspected) variants (client-side filter)',
      ),
    monitored_only: z
      .boolean()
      .optional()
      .describe(
        'If true, only return volcanoes actively monitored by AVO seismic/infrasound networks',
      ),
    name_contains: z
      .string()
      .optional()
      .describe(
        'Case-insensitive substring match against volcano name or official name, e.g. "cleveland"',
      ),
  })
  .strip();

const volcanoDetail = z
  .object({
    id: z
      .string()
      .min(1)
      .describe(
        'Volcano ID (e.g. "ak52"), VNUM (e.g. "311240"), or volcano name (e.g. "Cleveland")',
      ),
  })
  .strip();

const eruptionSearch = z
  .object({
    volcano_id: z
      .string()
      .optional()
      .describe(
        'GeoDIVA volcano ID to list eruptions for, e.g. "ak52" (from geodiva.volcano_list)',
      ),
    eruption_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Specific eruption record ID to retrieve, e.g. 4111'),
    sdate_start: z
      .string()
      .regex(
        DATE_RE,
        'must be a year, "YYYY-MM-DD", or "YYYY-MM-DDTHH:MM:SS" (negative years allowed for BCE)',
      )
      .optional()
      .describe(
        'Eruption start-date range lower bound — must be paired with sdate_end, e.g. "2000-01-01"',
      ),
    sdate_end: z
      .string()
      .regex(
        DATE_RE,
        'must be a year, "YYYY-MM-DD", or "YYYY-MM-DDTHH:MM:SS" (negative years allowed for BCE)',
      )
      .optional()
      .describe(
        'Eruption start-date range upper bound — must be paired with sdate_start, e.g. "2020-12-31"',
      ),
    edate_start: z
      .string()
      .regex(
        DATE_RE,
        'must be a year, "YYYY-MM-DD", or "YYYY-MM-DDTHH:MM:SS" (negative years allowed for BCE)',
      )
      .optional()
      .describe('Eruption end-date range lower bound — must be paired with edate_end'),
    edate_end: z
      .string()
      .regex(
        DATE_RE,
        'must be a year, "YYYY-MM-DD", or "YYYY-MM-DDTHH:MM:SS" (negative years allowed for BCE)',
      )
      .optional()
      .describe('Eruption end-date range upper bound — must be paired with edate_start'),
  })
  .strip()
  .describe(
    'Requires volcano_id, eruption_id, or a paired date range (sdate_start+sdate_end / edate_start+edate_end, max 20-year span unless volcano_id or eruption_id is also given)',
  );

export const geodivaSchemas: Record<string, ZodSchema> = {
  'geodiva.volcano_list': volcanoList,
  'geodiva.volcano_detail': volcanoDetail,
  'geodiva.eruption_search': eruptionSearch,
};
