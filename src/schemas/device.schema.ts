import { z, type ZodSchema } from 'zod';

/**
 * Ф5 device MCP projection schemas. `confirm` is a plain optional boolean
 * at the schema layer (not z.literal(true)) so device.command validates for
 * EVERY class uniformly -- whether confirm is actually REQUIRED depends on
 * the specific device's class (T1 vs T2+), which is only known once the
 * adapter resolves which vendor device is being addressed. The real
 * enforcement is device-safety.service.ts's `enforceDeviceSafety()`, run
 * inside the adapter after that resolution -- see its doc comment. This
 * schema only guards shape/type, not the class-specific safety policy.
 */

const deviceList = z.object({}).strip();

const deviceState = z
  .object({
    connection_id: z
      .string()
      .uuid()
      .describe('Your device-connection id from /connect/device/connections'),
    device_id: z.string().min(1).max(128).describe("The vendor's device id (from device.list)"),
  })
  .strip();

const deviceCommand = z
  .object({
    connection_id: z
      .string()
      .uuid()
      .describe('Your device-connection id from /connect/device/connections'),
    device_id: z.string().min(1).max(128).describe("The vendor's device id (from device.list)"),
    command: z
      .string()
      .min(1)
      .max(64)
      .describe("The device's data-point code, e.g. 'switch_1', 'temp_set'"),
    value: z
      .union([z.string(), z.number(), z.boolean()])
      .describe('The value to set for this command'),
    confirm: z
      .boolean()
      .optional()
      .describe(
        'Must be true for any device class flagged confirm_required in the safety layer (locks, valves, etc.)',
      ),
  })
  .strip();

export const deviceSchemas: Record<string, ZodSchema> = {
  'device.list': deviceList,
  'device.state': deviceState,
  'device.command': deviceCommand,
};
