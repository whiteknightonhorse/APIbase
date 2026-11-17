import { z, type ZodSchema } from 'zod';

const sendMessage = z
  .object({
    chat_id: z
      .union([z.string(), z.number()])
      .describe(
        'Telegram chat ID (number) or @channel_username (string) of a chat the bot was added to',
      ),
    text: z
      .string()
      .min(1)
      .max(4096)
      .describe(
        'Message text (max 4096 chars). Supports Markdown: *bold*, _italic_, `code`, [link](url)',
      ),
    parse_mode: z
      .enum(['Markdown', 'HTML'])
      .optional()
      .describe('Text formatting: "Markdown" or "HTML" (default plain text)'),
    disable_notification: z
      .boolean()
      .optional()
      .describe('Send silently without notification sound (default false)'),
  })
  .strip();

const sendPhoto = z
  .object({
    chat_id: z.union([z.string(), z.number()]).describe('Target chat ID or @channel_username'),
    photo: z.string().describe('Photo URL (https://...) or Telegram file_id from previous upload'),
    caption: z.string().max(1024).optional().describe('Photo caption (max 1024 chars)'),
  })
  .strip();

const sendDocument = z
  .object({
    chat_id: z.union([z.string(), z.number()]).describe('Target chat ID or @channel_username'),
    document: z.string().describe('Document URL (https://...) — PDF, CSV, ZIP, etc.'),
    caption: z.string().max(1024).optional().describe('Document caption'),
  })
  .strip();

const getChat = z
  .object({
    chat_id: z.union([z.string(), z.number()]).describe('Chat ID or @username to get info about'),
  })
  .strip();

export const telegramSchemas: Record<string, ZodSchema> = {
  'telegram.send_message': sendMessage,
  'telegram.send_photo': sendPhoto,
  'telegram.send_document': sendDocument,
  'telegram.get_chat': getChat,
};
