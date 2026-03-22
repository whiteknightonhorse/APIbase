import { z, type ZodSchema } from 'zod';

const toPdf = z.object({
  source_url: z.string().url().describe('Publicly accessible URL of the source file to convert (e.g. "https://example.com/report.docx")'),
  from_format: z.enum(['docx', 'xlsx', 'pptx', 'html', 'md', 'jpg', 'png', 'svg', 'rtf', 'odt', 'txt']).describe('Source file format'),
  page_size: z.enum(['a4', 'letter', 'legal', 'a3', 'a5']).optional().describe('PDF page size (default "a4")'),
  orientation: z.enum(['portrait', 'landscape']).optional().describe('Page orientation (default "portrait")'),
}).strip();

const fromPdf = z.object({
  source_url: z.string().url().describe('Publicly accessible URL of the PDF to convert (e.g. "https://example.com/doc.pdf")'),
  to_format: z.enum(['docx', 'xlsx', 'pptx', 'txt', 'jpg', 'png']).describe('Target format to convert PDF into'),
  pages: z.string().optional().describe('Page range to convert (e.g. "1-5", "1,3,5", default "all")'),
}).strip();

const webToPdf = z.object({
  url: z.string().url().describe('Web page URL to render as PDF (e.g. "https://example.com")'),
  viewport_width: z.number().int().min(320).max(3840).optional().describe('Browser viewport width in pixels (default 1280)'),
  delay: z.number().int().min(0).max(30).optional().describe('Seconds to wait after page load before capturing (default 0)'),
  load_lazy_content: z.boolean().optional().describe('Scroll page to trigger lazy-loaded images (default false)'),
}).strip();

export const convertapiSchemas: Record<string, ZodSchema> = {
  'convert.to_pdf': toPdf,
  'convert.from_pdf': fromPdf,
  'convert.web_to_pdf': webToPdf,
};
