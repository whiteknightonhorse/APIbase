import { z, type ZodSchema } from 'zod';

const sendSms = z
  .object({
    to: z
      .string()
      .min(1)
      .describe(
        'Recipient phone number in E.164 format (e.g. "+14155551234"). Trial accounts can only send to verified destination numbers added in the Telnyx portal.',
      ),
    from: z
      .string()
      .min(1)
      .describe(
        'Sender phone number in E.164 format — must be a Telnyx number you own (e.g. "+15551234567"). Provision via Telnyx portal Numbers > Buy Numbers.',
      ),
    text: z
      .string()
      .min(1)
      .max(1600)
      .describe('SMS body text (max 1600 chars; >160 splits into multiple billing segments).'),
    messaging_profile_id: z
      .string()
      .optional()
      .describe(
        'Optional Telnyx messaging profile UUID to route through a specific profile (10DLC campaign, sender pool).',
      ),
  })
  .strip();

const messageStatus = z
  .object({
    message_id: z
      .string()
      .min(1)
      .describe(
        'Telnyx message UUID returned by send_sms (e.g. "40ab7e80-94c6-4cb6-8c45-c3ed3e3bf3ec").',
      ),
  })
  .strip();

const listMessages = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Max number of messages to return per page (default 25, max 100).'),
    direction: z
      .enum(['inbound', 'outbound'])
      .optional()
      .describe('Filter by message direction: "outbound" (sent by us) or "inbound" (received).'),
    date_from: z
      .string()
      .optional()
      .describe(
        'ISO 8601 date — return messages created on or after this date (e.g. "2026-04-26").',
      ),
  })
  .strip();

const balance = z
  .object({
    refresh: z
      .boolean()
      .optional()
      .describe(
        'Set to true to bypass the 30-second cache and fetch a fresh balance from Telnyx. Default false.',
      ),
  })
  .strip();

export const telnyxSchemas: Record<string, ZodSchema> = {
  'telnyx.send_sms': sendSms,
  'telnyx.message_status': messageStatus,
  'telnyx.list_messages': listMessages,
  'telnyx.balance': balance,
};
