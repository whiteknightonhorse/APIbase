import { z, type ZodSchema } from 'zod';

const VOLCANO_IDS = [
  'taupo',
  'tongariro',
  'aucklandvolcanicfield',
  'kermadecislands',
  'mayorisland',
  'ngauruhoe',
  'northland',
  'okataina',
  'rotorua',
  'whiteisland',
  'ruapehu',
  'taranakiegmont',
] as const;

const quakeSearch = z
  .object({
    mmi: z
      .number()
      .int()
      .min(-1)
      .max(8)
      .describe(
        'Minimum Modified Mercalli Intensity (MMI) threshold, -1 to 8. Returns quakes that may ' +
          'have caused shaking greater than or equal to this value in the New Zealand region during ' +
          'the last 365 days (max 100 results). -1 = quakes too small to calculate a stable MMI.',
      ),
  })
  .strip();

const quakeDetail = z
  .object({
    public_id: z
      .string()
      .min(1)
      .max(32)
      .describe('GeoNet quake publicID, e.g. "2014p715167" (year + auto-generated code).'),
  })
  .strip();

const quakeStats = z
  .object({
    days: z
      .enum(['7', '28', '365'])
      .optional()
      .describe(
        'Limit the magnitude-count breakdown to this window (7, 28, or 365 days); returns all ' +
          'three windows if omitted (client-side filter).',
      ),
  })
  .strip();

const volcanoAlertLevel = z
  .object({
    volcano_id: z
      .enum(VOLCANO_IDS)
      .optional()
      .describe(
        'Filter to a single volcano by ID (e.g. "ruapehu", "whiteisland"); returns all 12 New ' +
          'Zealand monitored volcanoes if omitted (client-side filter).',
      ),
  })
  .strip();

export const geonetNzSchemas: Record<string, ZodSchema> = {
  'geonet-nz.quake_search': quakeSearch,
  'geonet-nz.quake_detail': quakeDetail,
  'geonet-nz.quake_stats': quakeStats,
  'geonet-nz.volcano_alert_level': volcanoAlertLevel,
};
