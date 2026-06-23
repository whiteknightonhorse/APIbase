import { z } from 'zod';

const searchParam = z
  .string()
  .optional()
  .describe(
    'OpenFDA search expression using Lucene syntax. ' +
      'Single field: device_name:"pacemaker" or recall_status:"Ongoing". ' +
      'Combined: device_name:"insulin pump"+AND+recall_status:"Ongoing". ' +
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

export const openfdaDevicesSchemas: Record<string, z.ZodSchema> = {
  'openfda_devices.recalls': z
    .object({
      search: searchParam,
      limit: limitParam,
      skip: skipParam,
    })
    .strip()
    .describe(
      'Search FDA medical device recall records. ' +
        'Useful fields to filter: device_name, recall_status (Ongoing/Terminated/Completed), ' +
        'recalling_firm, product_code, event_date_initiated.',
    ),

  'openfda_devices.clearances_510k': z
    .object({
      search: searchParam,
      limit: limitParam,
      skip: skipParam,
    })
    .strip()
    .describe(
      'Search FDA 510(k) premarket clearance submissions. ' +
        'Useful fields: device_name, applicant, k_number, decision_code (SESE=cleared), ' +
        'decision_date, product_code, advisory_committee_description.',
    ),

  'openfda_devices.adverse_events': z
    .object({
      search: searchParam,
      limit: limitParam,
      skip: skipParam,
    })
    .strip()
    .describe(
      'Search FDA MAUDE database for medical device adverse event (malfunction/injury/death) reports. ' +
        'Useful fields: device.brand_name, device.generic_name, event_type (Malfunction/Injury/Death), ' +
        'date_received, event_location.',
    ),

  'openfda_devices.classification': z
    .object({
      search: searchParam,
      limit: limitParam,
      skip: skipParam,
    })
    .strip()
    .describe(
      'Search FDA medical device classification database (product codes and risk classes). ' +
        'Useful fields: device_name, product_code, device_class (1=low risk, 2=moderate, 3=high risk), ' +
        'medical_specialty_description, regulation_number.',
    ),
};
