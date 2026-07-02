import { z } from 'zod';

export const cpscSchemas: Record<string, z.ZodType> = {
  'cpsc.search': z
    .object({
      product_name: z
        .string()
        .optional()
        .describe(
          'Product name keyword to filter recalls (partial match). ' +
            'Example: "bicycle helmet", "smoke detector", "baby carrier".',
        ),
      product_type: z
        .string()
        .optional()
        .describe(
          'CPSC product category to filter recalls. ' +
            'Common values: "Toys", "Clothing", "Furniture", "Sports & Recreation", ' +
            '"Home Furnishings", "Electronics", "Children\'s Products", "Power Tools". ' +
            'Must match a CPSC category name exactly.',
        ),
      manufacturer: z
        .string()
        .optional()
        .describe(
          'Manufacturer or brand name to filter recalls (partial match). ' +
            'Example: "Fisher-Price", "IKEA", "Honda".',
        ),
      date_start: z
        .string()
        .optional()
        .describe(
          'Start date for recall date range filter (ISO 8601 format YYYY-MM-DD). ' +
            'Example: "2024-01-01". Only returns recalls issued on or after this date.',
        ),
      date_end: z
        .string()
        .optional()
        .describe(
          'End date for recall date range filter (ISO 8601 format YYYY-MM-DD). ' +
            'Example: "2024-12-31". Only returns recalls issued on or before this date.',
        ),
      hazard: z
        .string()
        .optional()
        .describe(
          'Hazard type keyword to filter recalls. ' +
            'Must match an exact CPSC hazard name. Example: "fire hazard", "choking hazard". ' +
            'Note: use product_name or product_type for broader searches.',
        ),
      country: z
        .string()
        .optional()
        .describe(
          'Manufacturer country of origin to filter recalls. ' +
            'Example: "China", "United States", "Vietnam".',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe(
          'Maximum number of recalls to return (1–100, default 20). ' +
            'The API may match more records — use date_start/date_end to narrow results.',
        ),
    })
    .strip(),

  'cpsc.detail': z
    .object({
      recall_id: z
        .number()
        .int()
        .optional()
        .describe(
          'Numeric CPSC recall ID (RecallID field). ' +
            'Preferred over recall_number — use the integer ID returned by cpsc.safety.search. ' +
            'Example: 10840. At least one of recall_id or recall_number must be provided.',
        ),
      recall_number: z
        .string()
        .optional()
        .describe(
          'CPSC recall number string (RecallNumber field). ' +
            'Typically a 5-digit string like "26582". Use when you have the recall number ' +
            'from a CPSC press release but not the internal RecallID. ' +
            'At least one of recall_id or recall_number must be provided.',
        ),
    })
    .strip(),

  'cpsc.recent': z
    .object({
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(30)
        .describe(
          'Number of days to look back for recent recalls (1–365, default 30). ' +
            'Example: 7 returns recalls from the last week; 90 returns the last quarter.',
        ),
      product_type: z
        .string()
        .optional()
        .describe(
          'Optional CPSC product category to filter recent recalls. ' +
            'Example: "Toys", "Furniture", "Power Tools". ' +
            'Leave blank to get recent recalls across all categories.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe(
          'Maximum number of recent recalls to return (1–100, default 20). ' +
            'Results are ordered newest-first.',
        ),
    })
    .strip(),

  'cpsc.by_manufacturer': z
    .object({
      manufacturer: z
        .string()
        .min(2)
        .describe(
          'Manufacturer or brand name to retrieve all recalls for. ' +
            'Partial match is supported. ' +
            'Example: "Samsung", "Polaris", "Kidde", "Traeger".',
        ),
      date_start: z
        .string()
        .optional()
        .describe(
          'Start date filter (YYYY-MM-DD). Only returns recalls issued on or after this date. ' +
            'Example: "2020-01-01".',
        ),
      date_end: z
        .string()
        .optional()
        .describe(
          'End date filter (YYYY-MM-DD). Only returns recalls issued on or before this date. ' +
            'Example: "2024-12-31".',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe(
          'Maximum number of recalls to return (1–100, default 50). ' +
            'Prolific manufacturers may have many recalls — use date filters to narrow.',
        ),
    })
    .strip(),
};
