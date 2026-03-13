import { z, type ZodSchema } from 'zod';

const healthFoodSearch = z
  .object({
    query: z.string().describe('Food search query (e.g. "chicken breast", "brown rice", "vitamin D milk")'),
    data_type: z
      .enum(['Foundation', 'Branded', 'SR Legacy', 'all'])
      .optional()
      .describe('USDA data type filter: "Foundation" (reference foods), "Branded" (brand-name products), "SR Legacy" (legacy reference), "all" (default)'),
    brand_owner: z.string().optional().describe('Filter by brand owner name (e.g. "General Mills", "Tyson")'),
    page_size: z.number().int().min(1).max(200).optional().describe('Results per page (1-200, default 50)'),
    page_number: z.number().int().min(1).optional().describe('Page number (default 1)'),
  })
  .strip();

const healthFoodDetails = z
  .object({
    fdc_id: z.number().int().describe('USDA FoodData Central food ID (e.g. 171705 for chicken breast)'),
  })
  .strip();

const healthDrugEvents = z
  .object({
    search: z.string().describe('OpenFDA search query for adverse events (e.g. "patient.drug.medicinalproduct:aspirin", "patient.reaction.reactionmeddrapt:headache")'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (1-100, default 10)'),
    skip: z.number().int().min(0).optional().describe('Number of results to skip for pagination'),
  })
  .strip();

const healthFoodRecalls = z
  .object({
    search: z.string().optional().describe('OpenFDA search query for food recalls (e.g. "reason_for_recall:salmonella", "recalling_firm:\"Tyson\"")'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (1-100, default 10)'),
    skip: z.number().int().min(0).optional().describe('Number of results to skip for pagination'),
    status: z.enum(['Ongoing', 'Completed', 'Terminated']).optional().describe('Filter by recall status'),
  })
  .strip();

const healthDrugLabels = z
  .object({
    search: z.string().describe('OpenFDA search query for drug labels (e.g. "openfda.brand_name:ibuprofen", "openfda.generic_name:metformin", "drug_interactions:warfarin")'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (1-100, default 10)'),
    skip: z.number().int().min(0).optional().describe('Number of results to skip for pagination'),
  })
  .strip();

const healthSupplementSearch = z
  .object({
    query: z.string().describe('Supplement search query (e.g. "vitamin D", "fish oil", "probiotics")'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (1-100, default 25)'),
    offset: z.number().int().min(0).optional().describe('Result offset for pagination'),
  })
  .strip();

const healthSupplementDetails = z
  .object({
    dsld_id: z.number().int().describe('NIH DSLD supplement label ID'),
  })
  .strip();

export const healthSchemas: Record<string, ZodSchema> = {
  'health.food_search': healthFoodSearch,
  'health.food_details': healthFoodDetails,
  'health.drug_events': healthDrugEvents,
  'health.food_recalls': healthFoodRecalls,
  'health.drug_labels': healthDrugLabels,
  'health.supplement_search': healthSupplementSearch,
  'health.supplement_details': healthSupplementDetails,
};
