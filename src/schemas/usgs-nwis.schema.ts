import { z, type ZodSchema } from 'zod';

const dailyValues = z
  .object({
    site_no: z
      .string()
      .describe(
        'USGS gauge station number, 8–15 digits (e.g. "01646500" for Potomac River near DC). Use water.sites to find station numbers.',
      ),
    start_date: z
      .string()
      .optional()
      .describe(
        'Start date in YYYY-MM-DD format (e.g. "2026-01-01"). Defaults to 30 days ago if omitted.',
      ),
    end_date: z
      .string()
      .optional()
      .describe(
        'End date in YYYY-MM-DD format (e.g. "2026-06-30"). Defaults to today if omitted. Max range: 1 year.',
      ),
    parameter_cd: z
      .enum(['00060', '00065', '00010', '00095', '63680'])
      .optional()
      .describe(
        'USGS parameter code. "00060" = discharge/streamflow (ft3/s, default), "00065" = gage height (ft), "00010" = water temperature (°C), "00095" = specific conductance (µS/cm), "63680" = turbidity (FNU).',
      ),
  })
  .strip();

const annualStats = z
  .object({
    site_no: z
      .string()
      .describe(
        'USGS gauge station number, 8–15 digits (e.g. "01646500" for Potomac River near DC). Use water.sites to find station numbers.',
      ),
  })
  .strip();

const basinConditions = z
  .object({
    huc_code: z
      .string()
      .describe(
        'USGS Hydrologic Unit Code (HUC) — 8-digit watershed code (e.g. "02070008" for the Potomac Basin). Use 8-digit HUC for best results. Find HUC codes at water.usgs.gov/lookup/getwatershed.',
      ),
    period: z
      .string()
      .optional()
      .describe(
        'ISO 8601 duration for how recent the data should be (e.g. "PT2H" = last 2 hours, "PT6H" = last 6 hours). Default is "PT2H". Longer periods return more data but may slow the response.',
      ),
  })
  .strip();

const siteInfo = z
  .object({
    site_no: z
      .string()
      .describe(
        'USGS gauge station number, 8–15 digits (e.g. "01646500" for Potomac River near DC, "09380000" for Colorado River at Lee Ferry). Use water.sites to search by state or bounding box.',
      ),
  })
  .strip();

export const usgsNwisSchemas: Record<string, ZodSchema> = {
  'nwis.daily_values': dailyValues,
  'nwis.annual_stats': annualStats,
  'nwis.basin_conditions': basinConditions,
  'nwis.site_info': siteInfo,
};
