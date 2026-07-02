import { z } from 'zod';

export const smhiSchemas: Record<string, z.ZodTypeAny> = {
  'smhi.forecast': z
    .object({
      latitude: z
        .number()
        .min(-90)
        .max(90)
        .describe(
          'Latitude in decimal degrees (WGS84). Covers most of Europe. ' +
            'Examples: 59.3293 = Stockholm, 57.7089 = Göteborg, 67.8558 = Umeå, 51.5074 = London.',
        ),
      longitude: z
        .number()
        .min(-180)
        .max(180)
        .describe(
          'Longitude in decimal degrees (WGS84). Covers most of Europe. ' +
            'Examples: 18.0686 = Stockholm, 11.9746 = Göteborg, 20.2253 = Umeå, -0.1278 = London.',
        ),
    })
    .strip(),

  'smhi.fire_risk': z
    .object({
      latitude: z
        .number()
        .min(55)
        .max(70)
        .describe(
          'Latitude in decimal degrees for the location in Sweden (55–70°N). ' +
            'Examples: 59.3293 = Stockholm, 55.6050 = Malmö, 65.5848 = Sundsvall.',
        ),
      longitude: z
        .number()
        .min(10)
        .max(30)
        .describe(
          'Longitude in decimal degrees for the location in Sweden (10–30°E). ' +
            'Examples: 18.0686 = Stockholm, 13.0038 = Malmö, 17.3102 = Sundsvall.',
        ),
      period: z
        .enum(['daily', 'hourly'])
        .optional()
        .default('daily')
        .describe(
          'Forecast period granularity. ' +
            '"daily" = 7 daily steps (default, recommended for planning). ' +
            '"hourly" = sub-daily steps with higher temporal resolution.',
        ),
    })
    .strip(),

  'smhi.warnings': z
    .object({
      language: z
        .enum(['en', 'sv'])
        .optional()
        .default('en')
        .describe(
          'Response language preference (not sent to API — all warnings include English). ' +
            '"en" = English area names (default). "sv" = Swedish area names.',
        ),
    })
    .strip(),

  'smhi.observations': z
    .object({
      station_id: z
        .string()
        .describe(
          'SMHI weather station ID (numeric string). ' +
            'Common examples: "97400" = Stockholm-Arlanda Flygplats, ' +
            '"98230" = Stockholm-Observatoriekullen A, ' +
            '"72630" = Göteborg, "188800" = Abisko (Lapland), ' +
            '"61740" = Malmö. ' +
            'Station IDs can be found via the SMHI Open Data Meteorological Observations catalog ' +
            '(opendata-download-metobs.smhi.se) — over 1000 stations across Sweden.',
        ),
      parameter_id: z
        .string()
        .optional()
        .default('1')
        .describe(
          'SMHI measurement parameter ID. Defaults to "1" (air temperature, °C, hourly). ' +
            'Common values: "1" = air temperature (°C), "4" = wind speed (m/s), ' +
            '"6" = relative humidity (%), "9" = sea-level pressure (hPa), ' +
            '"12" = visibility (m), "39" = dew-point temperature (°C). ' +
            'Not all parameters are measured at every station.',
        ),
      period: z
        .enum(['latest-hour', 'latest-day', 'latest-months'])
        .optional()
        .default('latest-day')
        .describe(
          'Time window for observations. ' +
            '"latest-hour" = most recent single reading. ' +
            '"latest-day" = last 24 hours with hourly readings (~25 values, default). ' +
            '"latest-months" = recent months of data (availability varies by station).',
        ),
    })
    .strip(),
};
