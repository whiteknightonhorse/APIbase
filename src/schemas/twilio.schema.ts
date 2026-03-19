import { z, type ZodSchema } from 'zod';

const lookup = z.object({
  phone_number: z.string().min(1).describe('Phone number in E.164 format (e.g. "+14157012311", "+442071234567")'),
  include_carrier: z.boolean().optional().describe('Include carrier/line type info (costs extra credit). Returns carrier name, line type (mobile/landline/voip).'),
  include_caller_name: z.boolean().optional().describe('Include caller name CNAM lookup (costs extra credit). US numbers only.'),
}).strip();

const sendSms = z.object({
  to: z.string().min(1).describe('Recipient phone number in E.164 format (e.g. "+14155551234")'),
  from: z.string().min(1).describe('Sender phone number — must be a Twilio number you own (e.g. "+15551234567")'),
  body: z.string().min(1).max(1600).describe('SMS message text (max 1600 chars, splits into multiple segments if >160)'),
}).strip();

export const twilioSchemas: Record<string, ZodSchema> = {
  'twilio.lookup': lookup,
  'twilio.send_sms': sendSms,
};
