import { z, type ZodSchema } from 'zod';

const stations = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Optional search string to filter stations by name (e.g. "Gent", "Brussel"). Omit to return all 700+ Belgian stations.',
      ),
    lang: z
      .enum(['en', 'nl', 'fr', 'de'])
      .optional()
      .describe('Language for station names. One of: en, nl, fr, de. Default: en.'),
  })
  .strip();

const liveboard = z
  .object({
    station: z
      .string()
      .min(2)
      .describe(
        'Station name (e.g. "Gent-Sint-Pieters", "Brussel-Zuid", "Antwerpen-Centraal"). Must match the Belgian spelling.',
      ),
    arrdep: z
      .enum(['arrival', 'departure'])
      .optional()
      .describe('Show arrivals or departures at the station. Default: departure.'),
    results: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of trains to return. Default: 20, max: 50.'),
    date: z
      .string()
      .regex(/^\d{6}$/)
      .optional()
      .describe('Date in DDMMYY format (e.g. "290626" for 29 June 2026). Defaults to today.'),
    time: z
      .string()
      .regex(/^\d{4}$/)
      .optional()
      .describe('Time in HHMM format (e.g. "0930" for 09:30). Defaults to current time.'),
    lang: z
      .enum(['en', 'nl', 'fr', 'de'])
      .optional()
      .describe('Language for station and direction names. Default: en.'),
  })
  .strip();

const connections = z
  .object({
    from: z
      .string()
      .min(2)
      .describe(
        'Departure station name (e.g. "Brussel-Zuid", "Gent-Sint-Pieters"). Must match Belgian spelling.',
      ),
    to: z
      .string()
      .min(2)
      .describe(
        'Arrival station name (e.g. "Antwerpen-Centraal", "Brugge"). Must match Belgian spelling.',
      ),
    timesel: z
      .enum(['depart', 'arrive'])
      .optional()
      .describe(
        'Whether the provided time is the desired departure time or arrival time. Default: depart.',
      ),
    results: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe('Number of connections to return (1–10). Default: 6.'),
    date: z
      .string()
      .regex(/^\d{6}$/)
      .optional()
      .describe('Date in DDMMYY format (e.g. "290626" for 29 June 2026). Defaults to today.'),
    time: z
      .string()
      .regex(/^\d{4}$/)
      .optional()
      .describe('Time in HHMM format (e.g. "1430" for 14:30). Defaults to current time.'),
    lang: z
      .enum(['en', 'nl', 'fr', 'de'])
      .optional()
      .describe('Language for station and direction names. Default: en.'),
  })
  .strip();

const vehicle = z
  .object({
    id: z
      .string()
      .min(3)
      .describe(
        'Vehicle/train ID in iRail format (e.g. "BE.NMBS.IC1810", "BE.NMBS.S22308"). ' +
          'Obtain from liveboard or connections response.',
      ),
    date: z
      .string()
      .regex(/^\d{6}$/)
      .optional()
      .describe('Date in DDMMYY format (e.g. "290626" for 29 June 2026). Defaults to today.'),
    lang: z
      .enum(['en', 'nl', 'fr', 'de'])
      .optional()
      .describe('Language for station names. Default: en.'),
  })
  .strip();

const disturbances = z
  .object({
    lang: z
      .enum(['en', 'nl', 'fr', 'de'])
      .optional()
      .describe('Language for disturbance titles and descriptions. Default: en.'),
  })
  .strip();

export const irailSchemas: Record<string, ZodSchema> = {
  'irail.stations': stations,
  'irail.liveboard': liveboard,
  'irail.connections': connections,
  'irail.vehicle': vehicle,
  'irail.disturbances': disturbances,
};
