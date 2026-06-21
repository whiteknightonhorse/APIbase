import { z } from 'zod';

const RANK_VALUES = [
  'KINGDOM',
  'PHYLUM',
  'CLASS',
  'ORDER',
  'SUPERFAMILY',
  'FAMILY',
  'TRIBE',
  'GENUS',
  'SPECIES',
  'SUBSPECIES',
  'VARIETY',
  'FORM',
] as const;

const STATUS_VALUES = [
  'accepted',
  'synonym',
  'ambiguous synonym',
  'misapplied',
  'provisionally accepted',
] as const;

export const catalogueOfLifeSchemas: Record<string, z.ZodSchema> = {
  'col.search': z
    .object({
      query: z
        .string()
        .min(1)
        .describe(
          'Scientific or common name to search (e.g. "Homo sapiens", "Pinus sylvestris", "oak"). ' +
            'Partial names and genus-level queries are supported.',
        ),
      rank: z
        .enum(RANK_VALUES)
        .optional()
        .describe(
          'Restrict results to a specific taxonomic rank. One of: KINGDOM, PHYLUM, CLASS, ORDER, ' +
            'SUPERFAMILY, FAMILY, TRIBE, GENUS, SPECIES, SUBSPECIES, VARIETY, FORM.',
        ),
      status: z
        .enum(STATUS_VALUES)
        .optional()
        .describe(
          'Filter by taxonomic status. Use "accepted" to return only currently accepted names, ' +
            '"synonym" for synonyms, or omit to return all.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Maximum number of results to return (1–50, default 10).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Zero-based pagination offset for retrieving additional result pages (default 0).',
        ),
    })
    .strip(),

  'col.detail': z
    .object({
      taxon_id: z
        .string()
        .min(1)
        .describe(
          'Catalogue of Life usage ID for the taxon (e.g. "lom19ReAZMtfEGnM999rz1"). ' +
            'Obtain from col.search or col.suggest results.',
        ),
    })
    .strip(),

  'col.suggest': z
    .object({
      query: z
        .string()
        .min(1)
        .describe(
          'Partial or full name prefix for autocomplete (e.g. "Homo", "Pinus syl", "Pan tr"). ' +
            'Returns ranked suggestions from the COL working draft.',
        ),
      rank: z
        .enum(RANK_VALUES)
        .optional()
        .describe(
          'Restrict suggestions to a specific taxonomic rank (e.g. SPECIES, GENUS, FAMILY). ' +
            'Omit to return suggestions across all ranks.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe('Maximum number of autocomplete suggestions to return (1–25, default 10).'),
    })
    .strip(),

  'col.children': z
    .object({
      taxon_id: z
        .string()
        .min(1)
        .describe(
          'Catalogue of Life usage ID of the parent taxon whose immediate children to list ' +
            '(e.g. the ID for a family returns its genera; a genus returns its species). ' +
            'Obtain from col.search or col.suggest results.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of child taxa to return (1–100, default 20).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Zero-based pagination offset for large genera with many species (default 0).'),
    })
    .strip(),
};
