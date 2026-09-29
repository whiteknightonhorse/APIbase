import { z, type ZodSchema } from 'zod';

const reporter = z
  .string()
  .min(2)
  .describe('Reporting country ISO3 code (e.g. "usa", "chn", "deu").');
const partner = z
  .string()
  .optional()
  .describe('Partner country/region ISO3 code (default "wld" = World). E.g. "chn", "mex".');
const year = z
  .string()
  .min(4)
  .describe('Year or comma-separated years, max 10 (e.g. "2020" or "2018,2019,2020").');

// ---------------------------------------------------------------------------
// wits-trade.trade_stats — World Bank WITS trade flows
// ---------------------------------------------------------------------------

const witsTradeStats = z
  .object({
    reporter,
    partner,
    year,
    product: z
      .string()
      .optional()
      .describe(
        'Product/sector code (default "Total"). Sector codes like "16-24_FoodProd", "27-27_Fuels", "Food", or HS codes.',
      ),
    indicator: z
      .string()
      .optional()
      .describe(
        'Trade indicator code (default "XPRT-TRD-VL" = export value, US$ thousand). Others: "MPRT-TRD-VL" (import value), "TRD-VL" (total trade), "XPRT-PRTNR-SHR".',
      ),
  })
  .strip();

// ---------------------------------------------------------------------------
// wits-trade.tariff_stats — World Bank WITS tariff statistics
// ---------------------------------------------------------------------------

const witsTariffStats = z
  .object({
    reporter,
    partner,
    year,
    product: z
      .string()
      .optional()
      .describe('Product/sector code (default "Total"), sector name, or HS code.'),
    indicator: z
      .string()
      .optional()
      .describe(
        'Tariff indicator code (default "MFN-WGHTD-AVRG" = MFN weighted average tariff %). Others: "MFN-SMPL-AVRG", "AHS-WGHTD-AVRG" (applied weighted avg), "MFN-MXMM-RT", "MFN-DTY-FR-TRFF-LNS-SHR".',
      ),
  })
  .strip();

export const witsTradeSchemas: Record<string, ZodSchema> = {
  'wits-trade.trade_stats': witsTradeStats,
  'wits-trade.tariff_stats': witsTariffStats,
};
