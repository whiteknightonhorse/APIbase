import { z } from 'zod';

export const celestrakSchemas: Record<string, z.ZodTypeAny> = {
  'celestrak.tle': z
    .object({
      catnr: z
        .union([z.string(), z.number()])
        .describe(
          'NORAD catalog number (satellite ID). Examples: 25544 (ISS), 20580 (Hubble Space Telescope), 48274 (Starlink-1007). Integer between 1 and 99999. Obtain from celestrak.satellite.search or celestrak.satellite.group.',
        ),
    })
    .strip(),

  'celestrak.search': z
    .object({
      name: z
        .string()
        .min(2)
        .describe(
          'Satellite name substring to search (case-insensitive). Examples: "ISS", "STARLINK", "GPS", "NOAA", "GOES", "HUBBLE", "FENGYUN". Returns all satellites whose name contains this string. Minimum 2 characters.',
        ),
    })
    .strip(),

  'celestrak.group': z
    .object({
      group: z
        .enum([
          'stations',
          'weather',
          'noaa',
          'goes',
          'resource',
          'sarsat',
          'dmc',
          'tdrss',
          'argos',
          'planet',
          'spire',
          'geo',
          'intelsat',
          'ses',
          'iridium',
          'iridium-NEXT',
          'starlink',
          'oneweb',
          'orbcomm',
          'globalstar',
          'amateur',
          'cubesat',
          'other',
          'last-30-days',
          'active',
          'analyst',
          'gps-ops',
          'glo-ops',
          'galileo',
          'beidou',
          'sbas',
        ])
        .describe(
          'Predefined satellite group. Key groups: "stations" (ISS, CSS, Tiangong), "starlink" (SpaceX Starlink ~6000 sats), "active" (all active satellites ~7000), "gps-ops" (GPS operational), "glo-ops" (GLONASS), "galileo" (EU Galileo), "beidou" (Chinese BeiDou), "weather" (weather satellites), "noaa" (NOAA weather), "goes" (GOES geostationary weather), "geo" (all geostationary), "amateur" (amateur radio), "cubesat" (CubeSats), "last-30-days" (recent launches), "starlink", "oneweb", "iridium", "iridium-NEXT", "globalstar", "orbcomm", "intelsat", "ses", "planet", "spire", "sarsat", "dmc", "tdrss", "argos", "resource", "analyst".',
        ),
    })
    .strip(),

  'celestrak.intdes': z
    .object({
      intdes: z
        .string()
        .describe(
          'International designator (COSPAR ID) for the launch or object. Format: YYYY-NNNX where YYYY is launch year, NNN is launch number of that year (3 digits), and X is the piece letter (A=primary payload). Examples: "1998-067A" (ISS ZARYA module), "1990-037B" (Hubble Space Telescope), "2019-029B" (Starlink batch 1). The suffix letter distinguishes primary payload (A), rocket body (B), debris (C onward).',
        ),
    })
    .strip(),
};
