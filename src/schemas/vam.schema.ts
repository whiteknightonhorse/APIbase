import { z, type ZodSchema } from 'zod';

const search = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Keyword search across titles, descriptions, maker names, and materials ' +
          '(e.g. "teapot", "William Morris", "silk embroidery"). Leave empty to browse all objects.',
      ),
    object_type: z
      .string()
      .optional()
      .describe(
        'Filter by object type (e.g. "Painting", "Vase", "Tile", "Photograph", "Drawing", ' +
          '"Print", "Textile"). Case-sensitive; use exact V&A category names.',
      ),
    on_display: z
      .boolean()
      .optional()
      .describe(
        'When true, return only objects currently on display in V&A galleries. ' +
          'When false or omitted, include objects in storage too.',
      ),
    year_from: z
      .number()
      .int()
      .min(0)
      .max(2100)
      .optional()
      .describe('Earliest production year filter (e.g. 1750).'),
    year_to: z
      .number()
      .int()
      .min(0)
      .max(2100)
      .optional()
      .describe('Latest production year filter (e.g. 1850).'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('Number of results per page (1-30, default 10).'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for paginating through results (default 1).'),
  })
  .strip();

const objectDetail = z
  .object({
    system_number: z
      .string()
      .describe(
        'V&A system number identifying the museum object ' +
          '(e.g. "O429002", "O64940"). Returned in search results as system_number.',
      ),
  })
  .strip();

const byMaker = z
  .object({
    maker: z
      .string()
      .min(1)
      .describe(
        'Artist or maker name to search for (e.g. "Wedgwood", "William Morris", ' +
          '"Constable", "Beatrix Potter"). Partial matches are supported.',
      ),
    object_type: z
      .string()
      .optional()
      .describe('Filter maker results by object type (e.g. "Painting", "Ceramic", "Print").'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('Number of results per page (1-30, default 10).'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
  })
  .strip();

const byCategory = z
  .object({
    category_id: z
      .string()
      .describe(
        'V&A thesaurus category ID to browse. Common categories: ' +
          '"THES48982" (Ceramics, 73K+ objects), ' +
          '"THES48917" (Paintings, 23K+), ' +
          '"THES48968" (Designs, 25K+), ' +
          '"THES48966" (Drawings, 18K+), ' +
          '"THES48903" (Prints, 15K+), ' +
          '"THES48885" (Textiles, 7K+), ' +
          '"THES48910" (Photographs, 4K+), ' +
          '"THES48920" (Metalwork, 4K+).',
      ),
    query: z
      .string()
      .optional()
      .describe('Optional keyword to refine results within the category.'),
    on_display: z
      .boolean()
      .optional()
      .describe('When true, return only objects on display in V&A galleries.'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('Number of results per page (1-30, default 10).'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1).'),
  })
  .strip();

export const vamSchemas: Record<string, ZodSchema> = {
  'vam.search': search,
  'vam.object': objectDetail,
  'vam.by_maker': byMaker,
  'vam.by_category': byCategory,
};
