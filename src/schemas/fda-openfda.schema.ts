import { z } from 'zod';

const searchParam = z
  .string()
  .optional()
  .describe(
    'OpenFDA search expression using Lucene syntax. ' +
      'Single field: brand_name:"tylenol" or classification:"Class I". ' +
      'Combined: generic_name:"ibuprofen"+AND+dosage_form:"TABLET". ' +
      'Omit to return recent records sorted by date.',
  );

const limitParam = z
  .number()
  .int()
  .min(1)
  .max(99)
  .optional()
  .describe('Number of records to return (1–99, default 10).');

const skipParam = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('Number of records to skip for pagination (default 0).');

export const fdaOpenFdaSchemas: Record<string, z.ZodSchema> = {
  'fda_openfda.drug_recalls': z
    .object({
      search: searchParam,
      limit: limitParam,
      skip: skipParam,
    })
    .strip()
    .describe(
      'Search FDA drug recall enforcement records. ' +
        'Useful fields to filter: recalling_firm, classification (Class I/II/III), ' +
        'status (Ongoing/Terminated/Completed), product_description, recall_initiation_date. ' +
        'Distinct from device recalls (openfda_devices.recalls) and food recalls (health.food_enforcement).',
    ),

  'fda_openfda.ndc_directory': z
    .object({
      search: searchParam,
      limit: limitParam,
      skip: skipParam,
    })
    .strip()
    .describe(
      'Search the FDA National Drug Code (NDC) Directory — 137,000+ marketed drug products. ' +
        'Useful fields: product_ndc, generic_name, brand_name, labeler_name, dosage_form, route, ' +
        'active_ingredients.name, pharm_class, dea_schedule. ' +
        'Look up manufacturer, active ingredients, dosage form, and packaging for any US drug product by name or NDC code.',
    ),

  'fda_openfda.food_adverse_events': z
    .object({
      search: searchParam,
      limit: limitParam,
      skip: skipParam,
    })
    .strip()
    .describe(
      'Search the FDA CAERS database of food and dietary supplement adverse event reports. ' +
        'Useful fields: products.name_brand, products.industry_name, reactions, outcomes, date_created. ' +
        'Distinct from food recall enforcement (health.food_enforcement) — this covers consumer-reported ' +
        'illness/injury events, not manufacturer recalls.',
    ),
};
