import { z, type ZodSchema } from 'zod';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const searchAndLimit = z
  .object({
    search: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe('Free-text search across name/mission/agency fields, e.g. "falcon" or "artemis"'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Max results to return, 1-20 (default 10)'),
  })
  .strip();

const upcomingLaunches = searchAndLimit.describe(
  'List upcoming orbital launches, optionally filtered by a text search',
);

const launchDetail = z
  .object({
    id: z
      .string()
      .regex(UUID_RE, 'must be a launch UUID, e.g. "521f3a1c-f977-4306-9b7f-495858719adf"')
      .describe(
        'Launch UUID from launch-library-2.upcoming_launches results, e.g. "521f3a1c-f977-4306-9b7f-495858719adf"',
      ),
  })
  .strip();

const astronautSearch = searchAndLimit.describe(
  'Search the astronaut roster by name, optionally filtered by a text search',
);

const agencySearch = searchAndLimit.describe(
  'Search space agencies and launch operators by name, optionally filtered by a text search',
);

export const launchLibrary2Schemas: Record<string, ZodSchema> = {
  'launch-library-2.upcoming_launches': upcomingLaunches,
  'launch-library-2.launch_detail': launchDetail,
  'launch-library-2.astronaut_search': astronautSearch,
  'launch-library-2.agency_search': agencySearch,
};
