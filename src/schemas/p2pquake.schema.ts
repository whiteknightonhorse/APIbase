import { z, type ZodSchema } from 'zod';

const recentQuakes = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of events to return (default 10, max 100)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (0-based, default 0)'),
    order: z
      .number()
      .int()
      .optional()
      .describe('Sort direction: -1 for newest-first (default), 1 for oldest-first'),
    min_scale: z
      .number()
      .int()
      .optional()
      .describe(
        'Minimum JMA seismic intensity as raw scale value (10=Shindo1, 20=Shindo2, 30=Shindo3, ' +
          '40=Shindo4, 45=Shindo4+, 50=Shindo5w, 55=Shindo5s, 60=Shindo6w, 65=Shindo6s, 70=Shindo7)',
      ),
    max_scale: z
      .number()
      .int()
      .optional()
      .describe('Maximum JMA seismic intensity as raw scale value (same scale as min_scale)'),
    min_magnitude: z
      .number()
      .optional()
      .describe('Minimum earthquake magnitude (Richter scale, e.g. 5.0 for moderate earthquakes)'),
    max_magnitude: z.number().optional().describe('Maximum earthquake magnitude (Richter scale)'),
    prefecture: z
      .number()
      .int()
      .min(1)
      .max(47)
      .optional()
      .describe(
        'Filter by Japanese prefecture JIS code (1=Hokkaido, 13=Tokyo, 27=Osaka, 40=Fukuoka, 47=Okinawa)',
      ),
    quake_type: z
      .enum(['ScalePrompt', 'Destination', 'DetailScale', 'Foreign', 'Other'])
      .optional()
      .describe(
        'JMA report type filter: ScalePrompt=intensity prompt, Destination=epicenter info, ' +
          'DetailScale=full epicenter+intensity report, Foreign=overseas earthquake, Other=miscellaneous',
      ),
  })
  .strip();

const tsunamiWarnings = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of tsunami events to return (default 10, max 100)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (0-based, default 0)'),
    order: z
      .number()
      .int()
      .optional()
      .describe('Sort direction: -1 for newest-first (default), 1 for oldest-first'),
  })
  .strip();

const quakeHistory = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of historical earthquake records to return (default 20, max 100)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset for browsing older events (0-based, default 0)'),
    order: z
      .number()
      .int()
      .optional()
      .describe('Sort direction: -1 for newest-first (default), 1 for oldest-first'),
    min_scale: z
      .number()
      .int()
      .optional()
      .describe(
        'Minimum JMA intensity (10=Shindo1, 20=Shindo2, 30=Shindo3, 40=Shindo4, 45=Shindo4+, ' +
          '50=Shindo5w, 55=Shindo5s, 60=Shindo6w, 65=Shindo6s, 70=Shindo7)',
      ),
    max_scale: z
      .number()
      .int()
      .optional()
      .describe('Maximum JMA seismic intensity raw scale value'),
    min_magnitude: z
      .number()
      .optional()
      .describe('Minimum Richter magnitude (e.g. 6.0 for strong earthquakes)'),
    max_magnitude: z.number().optional().describe('Maximum Richter magnitude'),
    prefecture: z
      .number()
      .int()
      .min(1)
      .max(47)
      .optional()
      .describe(
        'Filter by prefecture JIS code (1=Hokkaido, 13=Tokyo, 27=Osaka, 40=Fukuoka, 47=Okinawa)',
      ),
  })
  .strip();

export const p2pquakeSchemas: Record<string, ZodSchema> = {
  'p2pquake.recent_quakes': recentQuakes,
  'p2pquake.tsunami_warnings': tsunamiWarnings,
  'p2pquake.quake_history': quakeHistory,
};
