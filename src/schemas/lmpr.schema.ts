import { z } from 'zod';

const dateParam = z
  .string()
  .optional()
  .describe(
    'Report date in YYYY-MM-DD or M/D/YYYY format (e.g. "2026-06-27"). Omit for the most recent published report.',
  );

const allSectionsParam = z
  .boolean()
  .optional()
  .default(true)
  .describe(
    'Return all report sections (price detail, primal values, etc.). Default true. Set false for summary only.',
  );

export const lmprSchemas: Record<string, z.ZodSchema> = {
  'lmpr.cattle_slaughter_prices': z
    .object({
      report_date: dateParam,
      all_sections: allSectionsParam,
    })
    .strip()
    .describe(
      '5-Area daily weighted-average direct slaughter cattle prices (LM_CT100). Returns head counts and price ranges by class (steer/heifer) and selling basis (live FOB, dressed delivered).',
    ),

  'lmpr.hog_slaughter_prices': z
    .object({
      report_date: dateParam,
      all_sections: allSectionsParam,
    })
    .strip()
    .describe(
      'National daily prior-day slaughtered swine prices (LM_HG201). Returns barrows/gilts head counts, negotiated prices, carcass measurements, and net price distribution.',
    ),

  'lmpr.boxed_beef_cutout': z
    .object({
      report_date: dateParam,
      all_sections: allSectionsParam,
    })
    .strip()
    .describe(
      'National weekly boxed beef cutout and individual cut prices (LM_XB459). Published Thursdays. Returns composite primal values, Choice/Select cutout, and detailed cut prices.',
    ),

  'lmpr.dairy_product_prices': z
    .object({
      report_date: dateParam,
      all_sections: allSectionsParam,
    })
    .strip()
    .describe(
      'National weekly dairy products sales prices (DYWDAIRYPRODUCTSSALES). Returns butter, cheddar block/barrel, dry whey, and nonfat dry milk prices and volumes.',
    ),

  'lmpr.lamb_carcass_cutout': z
    .object({
      report_date: dateParam,
      all_sections: allSectionsParam,
    })
    .strip()
    .describe(
      'National estimated lamb carcass cutout value (LM_XL502). Returns gross/net carcass values, foresaddle and hindsaddle values, and primal cut prices.',
    ),
};
