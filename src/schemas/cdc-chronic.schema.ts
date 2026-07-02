import { z } from 'zod';

export const cdcChronicSchemas: Record<string, z.ZodTypeAny> = {
  'cdc_chronic.indicators': z
    .object({
      topic_id: z
        .enum([
          'ALC',
          'ART',
          'AST',
          'CAN',
          'CHC',
          'CKD',
          'COPD',
          'CVD',
          'DIA',
          'DIS',
          'HEA',
          'IMM',
          'MAT',
          'MEN',
          'NMED',
          'NPAW',
          'ORH',
          'SLEP',
          'TOB',
        ])
        .optional()
        .describe(
          'Topic ID to filter by. Options: ALC=Alcohol, ART=Arthritis, AST=Asthma, CAN=Cancer, CHC=Cognitive Health, CKD=Chronic Kidney Disease, COPD=COPD, CVD=Cardiovascular, DIA=Diabetes, DIS=Disability, HEA=Health Status, IMM=Immunization, MAT=Maternal Health, MEN=Mental Health, NMED=Non-Medical Factors, NPAW=Nutrition/Physical Activity/Weight, ORH=Oral Health, SLEP=Sleep, TOB=Tobacco.',
        ),
      question_id: z
        .string()
        .optional()
        .describe(
          'Specific question ID to retrieve (e.g. "DIA01" for diabetes prevalence, "TOB04" for cigarette smoking, "CVD01" for high blood pressure). Combine with topic_id or use alone.',
        ),
      location: z
        .string()
        .length(2)
        .toUpperCase()
        .optional()
        .describe(
          'US state abbreviation (e.g. "CA", "TX", "NY") or "US" for national-level data. Two-letter FIPS abbreviation.',
        ),
      year_start: z
        .number()
        .int()
        .min(2010)
        .max(2030)
        .optional()
        .describe(
          'Earliest year to include (e.g. 2020). Data ranges from ~2010 to 2023. Defaults to all available years.',
        ),
      year_end: z
        .number()
        .int()
        .min(2010)
        .max(2030)
        .optional()
        .describe(
          'Latest year to include (e.g. 2023). Must be >= year_start. Defaults to all available years.',
        ),
      stratification_id: z
        .enum([
          'OVR',
          'SEXF',
          'SEXM',
          'AGE0_44',
          'AGE1844',
          'AGE4564',
          'AGE65P',
          'WHT',
          'BLK',
          'HIS',
          'ASN',
          'AIAN',
          'HAPI',
          'MRC',
        ])
        .optional()
        .describe(
          'Stratification (demographic subgroup) ID. OVR=Overall (default aggregate), SEXF=Female, SEXM=Male, AGE1844=Age 18-44, AGE4564=Age 45-64, AGE65P=Age 65+, WHT=White non-Hispanic, BLK=Black non-Hispanic, HIS=Hispanic, ASN=Asian non-Hispanic, AIAN=American Indian/Alaska Native, HAPI=Native Hawaiian/Pacific Islander, MRC=Multiracial non-Hispanic.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Maximum number of indicator records to return (1–200, default 25).'),
    })
    .strip(),

  'cdc_chronic.topics': z
    .object({
      topic_id: z
        .enum([
          'ALC',
          'ART',
          'AST',
          'CAN',
          'CHC',
          'CKD',
          'COPD',
          'CVD',
          'DIA',
          'DIS',
          'HEA',
          'IMM',
          'MAT',
          'MEN',
          'NMED',
          'NPAW',
          'ORH',
          'SLEP',
          'TOB',
        ])
        .optional()
        .describe(
          'Filter by a single topic to see only its questions. Omit to list all 19 topics with their questions. Options: ALC=Alcohol, ART=Arthritis, AST=Asthma, CAN=Cancer, CHC=Cognitive Health, CKD=Chronic Kidney Disease, COPD=COPD, CVD=Cardiovascular, DIA=Diabetes, DIS=Disability, HEA=Health Status, IMM=Immunization, MAT=Maternal Health, MEN=Mental Health, NMED=Non-Medical Factors, NPAW=Nutrition/Physical Activity/Weight, ORH=Oral Health, SLEP=Sleep, TOB=Tobacco.',
        ),
    })
    .strip(),

  'cdc_chronic.state_compare': z
    .object({
      question_id: z
        .string()
        .optional()
        .describe(
          'Question ID to compare across states (e.g. "DIA01" for diabetes prevalence, "TOB04" for smoking, "CVD01" for high blood pressure, "AST01" for asthma prevalence). Use cdc_chronic.topics to find valid IDs. Defaults to "DIA01".',
        ),
      year: z
        .number()
        .int()
        .min(2010)
        .max(2030)
        .optional()
        .describe(
          'Data year for comparison (e.g. 2023). Defaults to most recent available year (2023 or later). All states return the same year for a fair comparison.',
        ),
      stratification_id: z
        .enum([
          'OVR',
          'SEXF',
          'SEXM',
          'AGE0_44',
          'AGE1844',
          'AGE4564',
          'AGE65P',
          'WHT',
          'BLK',
          'HIS',
          'ASN',
          'AIAN',
          'HAPI',
          'MRC',
        ])
        .optional()
        .describe(
          'Demographic subgroup to compare. OVR=Overall (default, all adults), SEXF=Female, SEXM=Male, WHT=White non-Hispanic, BLK=Black non-Hispanic, HIS=Hispanic, AGE65P=Age 65+, etc.',
        ),
    })
    .strip(),

  'cdc_chronic.trend': z
    .object({
      question_id: z
        .string()
        .optional()
        .describe(
          'Question ID to retrieve trend data for (e.g. "TOB04" for cigarette smoking, "DIA01" for diabetes, "CVD01" for high blood pressure, "CAN01" for cancer screening). Use cdc_chronic.topics to find valid IDs. Defaults to "TOB04".',
        ),
      location: z
        .string()
        .length(2)
        .toUpperCase()
        .optional()
        .describe(
          'US state abbreviation (e.g. "CA", "TX", "FL") or "US" for national trend. Defaults to "US" for national-level data.',
        ),
      stratification_id: z
        .enum([
          'OVR',
          'SEXF',
          'SEXM',
          'AGE0_44',
          'AGE1844',
          'AGE4564',
          'AGE65P',
          'WHT',
          'BLK',
          'HIS',
          'ASN',
          'AIAN',
          'HAPI',
          'MRC',
        ])
        .optional()
        .describe(
          'Demographic subgroup for trend. OVR=Overall, SEXF=Female, SEXM=Male, BLK=Black non-Hispanic, HIS=Hispanic, etc. Omit for all subgroups.',
        ),
      value_type_id: z
        .enum(['CRDPREV', 'AGEADJPREV', 'NMBR', 'CRDRATE', 'AGEADJRATE', 'PCT'])
        .optional()
        .describe(
          'Data value type to filter on. CRDPREV=Crude Prevalence (%, unadjusted), AGEADJPREV=Age-adjusted Prevalence (%, adjusted), NMBR=Number (absolute count), CRDRATE=Crude Rate (per 100K), AGEADJRATE=Age-adjusted Rate (per 100K), PCT=Percentage.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe(
          'Maximum number of annual data points to return (1–50, default 20). Returns most recent years first.',
        ),
    })
    .strip(),
};
