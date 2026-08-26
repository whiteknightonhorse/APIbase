import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// enviroatlas.communities — list EPA EnviroAtlas pilot communities
// ---------------------------------------------------------------------------

const enviroatlasCommunities = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Filter the 32 EnviroAtlas pilot communities by name or state substring, case-insensitive (e.g. "TX" or "Portland"). Omit to list all of them.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// enviroatlas.block_group_metrics — ecosystem-service metrics for a point
// ---------------------------------------------------------------------------

const enviroatlasBlockGroupMetrics = z
  .object({
    lat: z
      .number()
      .min(-90)
      .max(90)
      .describe('Latitude in decimal degrees (e.g. 41.5868 for Des Moines, IA).'),
    lon: z
      .number()
      .min(-180)
      .max(180)
      .describe('Longitude in decimal degrees (e.g. -93.6091 for Des Moines, IA).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// enviroatlas.community_summary — aggregate ecosystem-service stats for a community
// ---------------------------------------------------------------------------

const enviroatlasCommunitySummary = z
  .object({
    community: z
      .string()
      .min(1)
      .describe(
        'EnviroAtlas pilot community code (e.g. "DMIA") or name (e.g. "Des Moines, IA"). Call enviroatlas.communities first to see all 32 covered communities.',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const enviroatlasSchemas: Record<string, ZodSchema> = {
  'enviroatlas.communities': enviroatlasCommunities,
  'enviroatlas.block_group_metrics': enviroatlasBlockGroupMetrics,
  'enviroatlas.community_summary': enviroatlasCommunitySummary,
};
