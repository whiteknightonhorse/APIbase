import { z, type ZodSchema } from 'zod';

const ID_TYPE_DESC =
  'Identifier type: "oclc" (WorldCat number), "isbn", "issn", "lccn" (Library of Congress ' +
  'Control Number), "htid" (HathiTrust volume ID, e.g. "pur1.32754075735872"), or ' +
  '"recordnumber" (HathiTrust catalog record number)';

const idTypeEnum = z.enum(['oclc', 'isbn', 'issn', 'lccn', 'htid', 'recordnumber']);

const lookupById = z
  .object({
    id_type: idTypeEnum.describe(ID_TYPE_DESC),
    id_value: z
      .string()
      .min(1)
      .describe('The identifier value to look up (e.g. "8727632" for an oclc id_type)'),
  })
  .strip();

const getFullRecord = z
  .object({
    id_type: idTypeEnum.describe(ID_TYPE_DESC),
    id_value: z
      .string()
      .min(1)
      .describe('The identifier value to look up (e.g. "8727632" for an oclc id_type)'),
  })
  .strip();

const batchLookup = z
  .object({
    ids: z
      .array(
        z
          .object({
            id_type: idTypeEnum.describe(ID_TYPE_DESC),
            id_value: z.string().min(1).describe('The identifier value to look up'),
          })
          .strip(),
      )
      .min(1)
      .max(10)
      .describe('1-10 identifiers to look up in a single call, each with its own id_type'),
  })
  .strip();

export const hathitrustDigitalSchemas: Record<string, ZodSchema> = {
  'hathitrust-digital.lookup_by_id': lookupById,
  'hathitrust-digital.get_full_record': getFullRecord,
  'hathitrust-digital.batch_lookup': batchLookup,
};
