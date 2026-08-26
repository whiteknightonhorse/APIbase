import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// paleoclimate.study_search — search NOAA NCEI paleoclimate studies
// ---------------------------------------------------------------------------

const paleoclimateStudySearch = z
  .object({
    searchText: z
      .string()
      .optional()
      .describe(
        'Free-text search across study title, investigators, and keywords (e.g. "temperature", "El Nino", "tree ring"). Provide this and/or locations/dataTypeId to narrow the search.',
      ),
    locations: z
      .string()
      .optional()
      .describe(
        'Continent or region name to filter by (e.g. "Antarctica", "North America", "Europe", "Africa").',
      ),
    dataTypeId: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe(
        'Numeric paleo record type filter. Known values: 1=Ice Cores, 2/3/7/16=Climate Reconstructions, 4=Corals And Sclerosponges, 5=Fauna, 6=Historical, 8/9/12/13=Paleolimnology, 10=Loess And Paleosol, 11=Climate Forcing, 14=Paleoceanography, 15=Plant Macrofossils.',
      ),
  })
  .strip()
  .describe(
    'Provide at least one of searchText, locations, or dataTypeId. Broad or unfiltered searches may fail with a response-too-large error — combine filters (e.g. searchText + locations) to narrow results.',
  );

// ---------------------------------------------------------------------------
// paleoclimate.study_detail — full detail for a single study
// ---------------------------------------------------------------------------

const paleoclimateStudyDetail = z
  .object({
    NOAAStudyId: z
      .string()
      .min(1)
      .describe(
        'NOAA Study ID (e.g. "10437"), obtained from paleoclimate.study_search results (noaa_study_id field).',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const paleoclimateSchemas: Record<string, ZodSchema> = {
  'paleoclimate.study_search': paleoclimateStudySearch,
  'paleoclimate.study_detail': paleoclimateStudyDetail,
};
