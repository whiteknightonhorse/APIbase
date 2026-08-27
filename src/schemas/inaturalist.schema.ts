import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// inaturalist.taxa_search — look up a species/taxon by name
// ---------------------------------------------------------------------------

const inaturalistTaxaSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('Common or scientific name to search for, e.g. "monarch butterfly" or "Quercus".'),
    rank: z
      .string()
      .optional()
      .describe(
        'Restrict results to a taxonomic rank, e.g. "species", "genus", "family", "order", "class", "kingdom".',
      ),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('Number of results to return, 1-30 (default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// inaturalist.observations_search — search wildlife observations
// ---------------------------------------------------------------------------

const inaturalistObservationsSearch = z
  .object({
    taxon_name: z
      .string()
      .optional()
      .describe('Scientific or common name to filter observations by, e.g. "Danaus plexippus".'),
    taxon_id: z
      .number()
      .int()
      .optional()
      .describe('Numeric taxon id from inaturalist.taxa_search to filter observations by.'),
    place_id: z
      .number()
      .int()
      .optional()
      .describe('Numeric place id from inaturalist.places_search to filter observations by.'),
    lat: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe('Latitude for a radius search. Must be paired with lng.'),
    lng: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe('Longitude for a radius search. Must be paired with lat.'),
    radius_km: z
      .number()
      .min(0.1)
      .max(500)
      .optional()
      .describe('Search radius in kilometers around lat/lng (default 10).'),
    observed_after: z
      .string()
      .optional()
      .describe('Only include observations on/after this date, ISO 8601 (YYYY-MM-DD).'),
    observed_before: z
      .string()
      .optional()
      .describe('Only include observations on/before this date, ISO 8601 (YYYY-MM-DD).'),
    quality_grade: z
      .enum(['casual', 'needs_id', 'research'])
      .optional()
      .describe(
        'Filter by data quality: "research" (community-verified ID), "needs_id" (unconfirmed), or "casual" (no photo/no location/captive).',
      ),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe(
        'Number of results to return, 1-20 (default 10). At least one of taxon_name, taxon_id, place_id, or lat/lng is required.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// inaturalist.species_counts — most-observed species in a place
// ---------------------------------------------------------------------------

const inaturalistSpeciesCounts = z
  .object({
    place_id: z
      .number()
      .int()
      .describe('Numeric place id from inaturalist.places_search to get species counts for.'),
    taxon_id: z
      .number()
      .int()
      .optional()
      .describe('Restrict to descendants of this taxon id, e.g. only birds or only plants.'),
    observed_after: z
      .string()
      .optional()
      .describe('Only include observations on/after this date, ISO 8601 (YYYY-MM-DD).'),
    observed_before: z
      .string()
      .optional()
      .describe('Only include observations on/before this date, ISO 8601 (YYYY-MM-DD).'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of species to return, ranked by observation count, 1-50 (default 20).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// inaturalist.places_search — look up a place id by name
// ---------------------------------------------------------------------------

const inaturalistPlacesSearch = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('Place name to search for, e.g. "Berlin" or "Yellowstone National Park".'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of results to return, 1-20 (default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const inaturalistSchemas: Record<string, ZodSchema> = {
  'inaturalist.taxa_search': inaturalistTaxaSearch,
  'inaturalist.observations_search': inaturalistObservationsSearch,
  'inaturalist.species_counts': inaturalistSpeciesCounts,
  'inaturalist.places_search': inaturalistPlacesSearch,
};
