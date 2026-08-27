import { z, type ZodSchema } from 'zod';

const SURFACE_TYPES = ['standard', 'sub_ice_topo'] as const;

const surfaceField = z
  .enum(SURFACE_TYPES)
  .optional()
  .describe(
    'Which GEBCO grid to query: "standard" (default) returns surface elevation, including the ' +
      'top of ice sheets where present; "sub_ice_topo" returns bedrock topography beneath ' +
      'Antarctic/Greenland ice sheets instead.',
  );

const elevationPoint = z
  .object({
    lat: z
      .number()
      .min(-90)
      .max(90)
      .describe('Latitude in decimal degrees (e.g. 51.4769 for Greenwich).'),
    lon: z
      .number()
      .min(-180)
      .max(180)
      .describe('Longitude in decimal degrees (e.g. -0.0005 for Greenwich).'),
    surface: surfaceField,
  })
  .strip();

const elevationProfile = z
  .object({
    points: z
      .array(
        z
          .object({
            lat: z.number().min(-90).max(90).describe('Latitude in decimal degrees.'),
            lon: z.number().min(-180).max(180).describe('Longitude in decimal degrees.'),
          })
          .strip(),
      )
      .min(2)
      .max(15)
      .describe(
        'Between 2 and 15 {lat, lon} points to query, e.g. a route or transect across the seafloor.',
      ),
    surface: surfaceField,
  })
  .strip();

export const gebcoSchemas: Record<string, ZodSchema> = {
  'gebco.elevation_point': elevationPoint,
  'gebco.elevation_profile': elevationProfile,
};
