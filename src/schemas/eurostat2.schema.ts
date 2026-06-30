import { z } from 'zod';

export const eurostat2Schemas: Record<string, z.ZodSchema> = {
  'eurostat2.fertility': z
    .object({
      country: z
        .string()
        .min(2)
        .max(12)
        .describe(
          'Eurostat geo code: ISO 3166-1 alpha-2 country (e.g. DE, FR, IT, ES, PL) or EU aggregate (EU27_2020, EA20)',
        ),
      indicator: z
        .enum(['TOTFERRT', 'AGEMOTH', 'AGEMOTH1', 'MEDAGEMOTH', 'NMARPCT'])
        .optional()
        .describe(
          'Fertility indicator: TOTFERRT=total fertility rate (default), AGEMOTH=mean age at childbirth, AGEMOTH1=mean age at first birth, MEDAGEMOTH=median age at childbirth, NMARPCT=share of non-marital births (%)',
        ),
      since_year: z
        .number()
        .int()
        .min(1960)
        .max(2030)
        .optional()
        .describe('First year to include (integer, e.g. 2010). Defaults to 2010.'),
    })
    .strip(),

  'eurostat2.ghg_emissions': z
    .object({
      country: z
        .string()
        .min(2)
        .max(12)
        .describe(
          'Eurostat geo code: ISO 3166-1 alpha-2 country (e.g. DE, FR, PL) or EU aggregate (EU27_2020, EA20)',
        ),
      pollutant: z
        .enum(['GHG', 'CO2', 'CH4', 'N2O', 'HFC', 'PFC', 'SF6'])
        .optional()
        .describe(
          'Greenhouse gas or pollutant: GHG=all greenhouse gases in CO2-equivalent (default), CO2=carbon dioxide, CH4=methane, N2O=nitrous oxide, HFC=hydrofluorocarbons, PFC=perfluorocarbons, SF6=sulphur hexafluoride',
        ),
      since_year: z
        .number()
        .int()
        .min(1985)
        .max(2030)
        .optional()
        .describe('First year to include (integer, e.g. 2005). Defaults to 2000.'),
    })
    .strip(),

  'eurostat2.rd_spending': z
    .object({
      country: z
        .string()
        .min(2)
        .max(12)
        .describe(
          'Eurostat geo code: ISO 3166-1 alpha-2 country (e.g. DE, FR, SE) or EU aggregate (EU27_2020)',
        ),
      unit: z
        .enum(['PC_GDP', 'MIO_EUR', 'MIO_NAC'])
        .optional()
        .describe(
          'Measurement unit: PC_GDP=percentage of GDP (default), MIO_EUR=million euros, MIO_NAC=million national currency',
        ),
      sector: z
        .enum(['TOTAL', 'BES', 'GOV', 'HES', 'PNP'])
        .optional()
        .describe(
          'Performing sector: TOTAL=all sectors combined (default), BES=business enterprise sector, GOV=government sector, HES=higher education sector, PNP=private non-profit sector',
        ),
      since_year: z
        .number()
        .int()
        .min(1980)
        .max(2030)
        .optional()
        .describe('First year to include (integer, e.g. 2005). Defaults to 2005.'),
    })
    .strip(),

  'eurostat2.renewable_energy': z
    .object({
      country: z
        .string()
        .min(2)
        .max(12)
        .describe(
          'Eurostat geo code: ISO 3166-1 alpha-2 country (e.g. DE, SE, DK) or EU aggregate (EU27_2020)',
        ),
      unit: z
        .enum(['MTOE', 'I05', 'TOE_HAB'])
        .optional()
        .describe(
          'Measurement unit: MTOE=million tonnes of oil equivalent (default), I05=index with 2005=100, TOE_HAB=tonnes of oil equivalent per inhabitant',
        ),
      since_year: z
        .number()
        .int()
        .min(2000)
        .max(2030)
        .optional()
        .describe('First year to include (integer, e.g. 2010). Defaults to 2005.'),
    })
    .strip(),

  'eurostat2.youth_employment': z
    .object({
      country: z
        .string()
        .min(2)
        .max(12)
        .describe(
          'Eurostat geo code: ISO 3166-1 alpha-2 country (e.g. DE, FR, ES) or EU aggregate (EU27_2020)',
        ),
      age_group: z
        .enum(['Y15-24', 'Y15-19', 'Y15-29', 'Y20-24', 'Y20-29'])
        .optional()
        .describe(
          'Youth age group: Y15-24=15 to 24 years (default), Y15-19=15 to 19 years, Y15-29=15 to 29 years, Y20-24=20 to 24 years, Y20-29=20 to 29 years',
        ),
      since_year: z
        .number()
        .int()
        .min(2000)
        .max(2030)
        .optional()
        .describe('First year to include (integer, e.g. 2010). Defaults to 2005.'),
    })
    .strip(),
};
