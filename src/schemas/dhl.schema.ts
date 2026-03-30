import { z, type ZodSchema } from 'zod';

const track = z
  .object({
    tracking_number: z
      .string()
      .min(1)
      .describe(
        'DHL tracking number (e.g. "00340434292135100186" for DHL Paket, "1234567890" for DHL Express). Supports all DHL services: Express, Parcel, eCommerce, Freight',
      ),
  })
  .strip();

export const dhlSchemas: Record<string, ZodSchema> = {
  'dhl.track': track,
};
