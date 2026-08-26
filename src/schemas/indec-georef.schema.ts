import { z, type ZodSchema } from 'zod';

// ---------------------------------------------------------------------------
// indec-georef.geocode — forward geocode an Argentine street address
// ---------------------------------------------------------------------------

const indecGeorefGeocode = z
  .object({
    address: z
      .string()
      .min(1)
      .describe(
        'Argentine street address to geocode, street name + house number (e.g. "Av Corrientes 1000"). Returns matching addresses with lat/lon and administrative location.',
      ),
    max: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of address matches to return (1-50, default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// indec-georef.reverse_geocode — reverse geocode a coordinate pair
// ---------------------------------------------------------------------------

const indecGeorefReverseGeocode = z
  .object({
    lat: z.number().min(-90).max(90).describe('Latitude in decimal degrees (e.g. -34.6).'),
    lon: z.number().min(-180).max(180).describe('Longitude in decimal degrees (e.g. -58.45).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// indec-georef.provincias — list/search Argentine provinces
// ---------------------------------------------------------------------------

const indecGeorefProvincias = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        'Filter provinces by name substring, case-insensitive (e.g. "buenos" for Buenos Aires). Omit to list all 24 provinces (incl. CABA).',
      ),
    max: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of provinces to return (1-50, default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// indec-georef.departamentos — list/search Argentine departments (2nd-level divisions)
// ---------------------------------------------------------------------------

const indecGeorefDepartamentos = z
  .object({
    query: z
      .string()
      .optional()
      .describe('Filter departments by name substring, case-insensitive (e.g. "capital").'),
    provincia: z
      .string()
      .optional()
      .describe('Restrict results to a province, by name or id (e.g. "Córdoba" or "14").'),
    max: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of departments to return (1-50, default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// indec-georef.localidades — search Argentine localities (cities/towns)
// ---------------------------------------------------------------------------

const indecGeorefLocalidades = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('Locality (city/town) name to search for, case-insensitive (e.g. "Palermo").'),
    provincia: z
      .string()
      .optional()
      .describe('Restrict results to a province, by name or id (e.g. "Santa Fe" or "82").'),
    max: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of localities to return (1-50, default 10).'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Export map
// ---------------------------------------------------------------------------

export const indecGeorefSchemas: Record<string, ZodSchema> = {
  'indec-georef.geocode': indecGeorefGeocode,
  'indec-georef.reverse_geocode': indecGeorefReverseGeocode,
  'indec-georef.provincias': indecGeorefProvincias,
  'indec-georef.departamentos': indecGeorefDepartamentos,
  'indec-georef.localidades': indecGeorefLocalidades,
};
