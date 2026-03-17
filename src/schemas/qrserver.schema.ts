import { z, type ZodSchema } from 'zod';

const generate = z
  .object({
    data: z
      .string()
      .describe('Text or URL to encode into a QR code (required)'),
    size: z
      .string()
      .optional()
      .describe('Image size in WxH pixels, e.g. "200x200", "400x400" (default: "200x200")'),
    format: z
      .enum(['png', 'svg'])
      .optional()
      .describe('Image format: "png" or "svg" (default: "png")'),
    color: z
      .string()
      .optional()
      .describe('Foreground color as 6-digit hex without #, e.g. "000000" for black (default: "000000")'),
    bgcolor: z
      .string()
      .optional()
      .describe('Background color as 6-digit hex without #, e.g. "ffffff" for white (default: "ffffff")'),
    margin: z
      .number()
      .int()
      .min(0)
      .max(50)
      .optional()
      .describe('Quiet zone margin in modules around the QR code (default: 1)'),
    ecc: z
      .enum(['L', 'M', 'Q', 'H'])
      .optional()
      .describe('Error correction level: L (7%), M (15%), Q (25%), H (30%) — higher allows more damage tolerance (default: "L")'),
  })
  .strip();

const read = z
  .object({
    fileurl: z
      .string()
      .url()
      .describe('URL of an image containing a QR code to decode (required)'),
  })
  .strip();

export const qrserverSchemas: Record<string, ZodSchema> = {
  'qrserver.generate': generate,
  'qrserver.read': read,
};
