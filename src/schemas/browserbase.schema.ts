import { z, type ZodSchema } from 'zod';

const createSession = z.object({
  proxy: z.boolean().optional().describe('Use residential proxy for the session (default false)'),
  region: z.enum(['us-west-2', 'us-east-1', 'eu-central-1', 'ap-southeast-1']).optional().describe('Browser region (default us-west-2)'),
}).strip();

const sessionStatus = z.object({
  session_id: z.string().min(1).describe('Browserbase session ID (from create_session result)'),
}).strip();

const sessionContent = z.object({
  session_id: z.string().min(1).describe('Session ID to get downloads/content from'),
}).strip();

const listSessions = z.object({
  status: z.enum(['RUNNING', 'ERROR', 'TIMED_OUT', 'COMPLETED']).optional().describe('Filter by session status (default RUNNING)'),
}).strip();

export const browserbaseSchemas: Record<string, ZodSchema> = {
  'browser.create_session': createSession,
  'browser.session_status': sessionStatus,
  'browser.session_content': sessionContent,
  'browser.list_sessions': listSessions,
};
