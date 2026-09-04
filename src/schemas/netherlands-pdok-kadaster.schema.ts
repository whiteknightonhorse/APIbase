import { z, type ZodSchema } from 'zod';

const lat = z
  .number()
  .min(-90)
  .max(90)
  .optional()
  .describe(
    'Decimal degree latitude (WGS84) — must be supplied together with lng. Omit both for full Netherlands coverage.',
  );
const lng = z
  .number()
  .min(-180)
  .max(180)
  .optional()
  .describe('Decimal degree longitude (WGS84) — must be supplied together with lat.');

const searchPercelen = z
  .object({
    lat,
    lng,
    radius_km: z
      .number()
      .min(0.1)
      .max(20)
      .optional()
      .describe('Search radius in kilometres around lat/lng (default 1, max 20)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('Maximum cadastral parcels to return (default 10, max 30)'),
  })
  .strip()
  .describe(
    'Search Dutch cadastral parcels (kadastrale percelen) near a point, from the Kadaster ' +
      'Basisregistratie Kadaster (BRK) cadastral map',
  );

const getPerceel = z
  .object({
    id: z
      .string()
      .min(1)
      .describe(
        'Feature id (UUID) of a cadastral parcel, e.g. from netherlands-pdok-kadaster.search_percelen results',
      ),
  })
  .strip()
  .describe('Look up a single Dutch cadastral parcel by its feature id');

const searchBebouwing = z
  .object({
    lat,
    lng,
    radius_km: z
      .number()
      .min(0.1)
      .max(20)
      .optional()
      .describe('Search radius in kilometres around lat/lng (default 1, max 20)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('Maximum building outlines to return (default 10, max 30)'),
  })
  .strip()
  .describe(
    'Search Dutch building outlines (bebouwing) near a point, from the Kadaster ' +
      'Basisregistratie Kadaster (BRK) cadastral map',
  );

export const netherlandsPdokKadasterSchemas: Record<string, ZodSchema> = {
  'netherlands-pdok-kadaster.search_percelen': searchPercelen,
  'netherlands-pdok-kadaster.get_perceel': getPerceel,
  'netherlands-pdok-kadaster.search_bebouwing': searchBebouwing,
};
