import { z, type ZodSchema } from 'zod';

const municipalities = z
  .object({
    province_code: z
      .enum(['EC', 'FS', 'GP', 'KZN', 'LP', 'MP', 'NC', 'NW', 'WC'])
      .optional()
      .describe(
        'Filter by province code: EC=Eastern Cape, FS=Free State, GP=Gauteng, KZN=KwaZulu-Natal, ' +
          'LP=Limpopo, MP=Mpumalanga, NC=Northern Cape, NW=North West, WC=Western Cape',
      ),
    category: z
      .enum(['A', 'B', 'C'])
      .optional()
      .describe(
        'Municipality category: A=Metropolitan, B=Local (most), C=District. ' +
          'SA has 8 metros (A), ~205 local (B), and 44 district (C) municipalities.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(300)
      .optional()
      .describe(
        'Maximum number of municipalities to return (1-300, default 50). Use 300 for full list.',
      ),
  })
  .strip();

const auditOpinions = z
  .object({
    demarcation_code: z
      .string()
      .min(2)
      .max(6)
      .optional()
      .describe(
        'Municipality demarcation code to filter (e.g. CPT=Cape Town, JHB=Johannesburg, ETH=eThekwini/Durban, ' +
          'TSH=Tshwane, EKU=Ekurhuleni). Omit to retrieve opinions across all municipalities.',
      ),
    year: z
      .number()
      .int()
      .min(2010)
      .max(2024)
      .optional()
      .describe(
        'Financial year-end filter (e.g. 2022 = financial year ended June 2022). Range: 2010-2024.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of audit opinion records to return (1-100, default 20).'),
  })
  .strip();

const incomeExpenditure = z
  .object({
    demarcation_code: z
      .string()
      .min(2)
      .max(6)
      .describe(
        'Municipality demarcation code (e.g. CPT=Cape Town, JHB=Johannesburg, ETH=eThekwini, ' +
          'TSH=Tshwane, EKU=Ekurhuleni, BUF=Buffalo City). Required.',
      ),
    year: z
      .number()
      .int()
      .min(2010)
      .max(2024)
      .optional()
      .describe(
        'Financial year-end to retrieve (e.g. 2022). Omit for all available years. ' +
          'Returns audited actual figures (AUDA) at annual period level.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Maximum line items to return (1-200, default 50).'),
  })
  .strip();

const officials = z
  .object({
    demarcation_code: z
      .string()
      .min(2)
      .max(6)
      .describe(
        'Municipality demarcation code to look up officials for ' +
          '(e.g. CPT=Cape Town, JHB=Johannesburg, ETH=eThekwini, TSH=Tshwane).',
      ),
    role: z
      .string()
      .optional()
      .describe(
        'Filter by role name (e.g. "Mayor/Executive Mayor", "Chief Financial Officer", "Municipal Manager"). ' +
          'Case-sensitive, partial matches not supported.',
      ),
  })
  .strip();

export const samuniSchemas: Record<string, ZodSchema> = {
  'samuni.municipalities': municipalities,
  'samuni.audit_opinions': auditOpinions,
  'samuni.income_expenditure': incomeExpenditure,
  'samuni.officials': officials,
};
