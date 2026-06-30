import { z } from 'zod';

const latLng = {
  latitude: z
    .number()
    .min(-90)
    .max(90)
    .describe('Latitude of the location in decimal degrees (e.g. 48.8566 for Paris)'),
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .describe('Longitude of the location in decimal degrees (e.g. 2.3522 for Paris)'),
  timezone: z
    .string()
    .optional()
    .default('UTC')
    .describe(
      'IANA timezone name for returned timestamps (e.g. "Europe/Paris", "America/New_York"). Defaults to UTC.',
    ),
};

const FORECAST_POLLUTANTS_DESC =
  'Comma-separated pollutant variables to return. Available: pm10, pm2_5, carbon_monoxide, ' +
  'nitrogen_dioxide, sulphur_dioxide, ozone, aerosol_optical_depth, dust, uv_index, ' +
  'ammonia, european_aqi, us_aqi. Defaults to pm10,pm2_5,nitrogen_dioxide,ozone,european_aqi,us_aqi.';

export const openmeteoaqSchemas: Record<string, z.ZodTypeAny> = {
  'openmeteoaq.current': z
    .object({
      ...latLng,
    })
    .strip()
    .describe(
      'Get current air quality conditions for a global location. Returns PM10, PM2.5, NO2, O3, SO2, ' +
        'CO, dust, UV index, European AQI (0-500), and US AQI (0-500+). Data sourced from Copernicus CAMS.',
    ),

  'openmeteoaq.forecast': z
    .object({
      ...latLng,
      forecast_days: z
        .number()
        .int()
        .min(1)
        .max(7)
        .optional()
        .default(3)
        .describe('Number of days to forecast (1–7). Defaults to 3.'),
      pollutants: z.string().optional().describe(FORECAST_POLLUTANTS_DESC),
    })
    .strip()
    .describe(
      'Get hourly air quality forecast for up to 7 days for a global location. Returns time-series ' +
        'arrays for selected pollutants and AQI indices. Data sourced from Copernicus CAMS.',
    ),

  'openmeteoaq.historical': z
    .object({
      ...latLng,
      start_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe(
          'Start date in YYYY-MM-DD format (e.g. "2024-01-01"). Historical data from 2022.',
        ),
      end_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe(
          'End date in YYYY-MM-DD format (e.g. "2024-01-31"). Maximum range is ~1 year per query.',
        ),
      pollutants: z.string().optional().describe(FORECAST_POLLUTANTS_DESC),
    })
    .strip()
    .describe(
      'Retrieve historical hourly air quality data for a date range at any global location. ' +
        'Returns time-series arrays for PM2.5, PM10, AQI and other pollutants. History available from 2022.',
    ),

  'openmeteoaq.pollen': z
    .object({
      ...latLng,
      forecast_days: z
        .number()
        .int()
        .min(1)
        .max(7)
        .optional()
        .default(3)
        .describe('Number of forecast days to include in hourly pollen data (1–7). Defaults to 3.'),
    })
    .strip()
    .describe(
      'Get current and forecast pollen concentrations (grains/m³) for a global location. ' +
        'Returns alder, birch, grass, mugwort, olive, and ragweed pollen — useful for allergy risk agents. ' +
        'Data sourced from Copernicus CAMS.',
    ),
};
