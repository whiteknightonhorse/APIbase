import { z } from 'zod';

export const tflSchemas: Record<string, z.ZodTypeAny> = {
  'tfl.line_status': z
    .object({
      modes: z
        .string()
        .optional()
        .describe(
          'Comma-separated transport modes to query (e.g. tube,overground,elizabeth-line,dlr,bus,tram,cable-car). ' +
            'Defaults to tube,overground,elizabeth-line,dlr. Valid modes: tube, overground, elizabeth-line, dlr, bus, tram, cable-car, river-bus.',
        ),
      include_good_service: z
        .boolean()
        .optional()
        .describe(
          'Whether to include lines running with Good Service in the results (default true). ' +
            'Set to false to return only lines with disruptions, delays, or suspensions.',
        ),
      detail: z
        .boolean()
        .optional()
        .describe(
          'Include additional disruption detail such as affected stops (default false). ' +
            'When true, the response includes affected station lists for each disruption.',
        ),
    })
    .strip(),

  'tfl.arrivals': z
    .object({
      line_id: z
        .string()
        .describe(
          'TfL line ID (e.g. central, bakerloo, victoria, northern, jubilee, elizabeth, overground, dlr, piccadilly). ' +
            'Use lowercase, hyphens for multi-word lines (e.g. elizabeth-line → use elizabeth).',
        ),
      stop_id: z
        .string()
        .describe(
          'NAPTAN stop point ID for the station (e.g. 940GZZLUHPK for Holland Park, 940GZZLUKSX for Kings Cross St. Pancras). ' +
            'Format: 940GZZLU + station code for tube stops.',
        ),
      direction: z
        .enum(['inbound', 'outbound', 'all'])
        .optional()
        .describe(
          'Filter arrivals by direction of travel (inbound, outbound, or all). Defaults to all directions.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe(
          'Maximum number of arrival predictions to return, sorted by soonest first (1–50). Defaults to 20.',
        ),
    })
    .strip(),

  'tfl.journey_plan': z
    .object({
      from: z
        .string()
        .describe(
          'Journey origin — accepts NAPTAN IDs (940GZZLUKSX), ICS codes (1000008), lat/lon pairs (51.509,-0.128), ' +
            'or free-text location names (e.g. Kings Cross, Victoria, London Bridge).',
        ),
      to: z
        .string()
        .describe(
          'Journey destination — accepts NAPTAN IDs, ICS codes, lat/lon pairs, or free-text location names ' +
            '(e.g. Heathrow Terminal 5, Canary Wharf, Waterloo).',
        ),
      mode: z
        .string()
        .optional()
        .describe(
          'Comma-separated preferred transport modes for the journey ' +
            '(e.g. tube,bus,walking or tube,overground,elizabeth-line). ' +
            'Defaults to all available TfL modes including walking.',
        ),
      date: z
        .string()
        .optional()
        .describe(
          'Journey date in YYYYMMDD format (e.g. 20250710). Defaults to today. ' +
            'Used together with time to find departures or arrivals at that datetime.',
        ),
      time: z
        .string()
        .optional()
        .describe(
          'Journey time in HHMM 24-hour format (e.g. 0830, 1730). Defaults to current time. ' +
            'Interpreted as departure time unless time_is is set to Arriving.',
        ),
      time_is: z
        .enum(['Departing', 'Arriving'])
        .optional()
        .describe(
          'Whether the time parameter represents a departure or arrival time (Departing or Arriving). ' +
            'Defaults to Departing.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe('Maximum number of journey options to return (1–5). Defaults to 3.'),
    })
    .strip(),

  'tfl.bike_points': z
    .object({
      query: z
        .string()
        .optional()
        .describe(
          'Search by station name or location keyword to filter bike docking points ' +
            '(e.g. Waterloo, Soho, Hyde Park, Paddington). Returns all 799+ stations when omitted.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe(
          'Maximum number of docking stations to return (1–200). Defaults to 50. ' +
            'Use with query to narrow results to a specific area.',
        ),
    })
    .strip(),
};
