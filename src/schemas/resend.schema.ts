import { z, type ZodSchema } from 'zod';

const sendEmail = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]).describe('Recipient email address(es) — single email or array of emails'),
  subject: z.string().min(1).describe('Email subject line'),
  text: z.string().optional().describe('Plain text email body'),
  html: z.string().optional().describe('HTML email body (alternative to text)'),
  from: z.string().optional().describe('Sender email (default: noreply@apibase.pro). Must be a verified domain.'),
  reply_to: z.string().email().optional().describe('Reply-to email address'),
}).strip();

const emailStatus = z.object({
  email_id: z.string().describe('Email ID returned from send_email (e.g. "d1c6e0a8-...")'),
}).strip();

export const resendSchemas: Record<string, ZodSchema> = {
  'resend.send_email': sendEmail,
  'resend.email_status': emailStatus,
};
