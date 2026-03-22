import { z, type ZodSchema } from 'zod';

const fromHtml = z.object({
  html: z.string().min(1).describe('HTML content to convert to PDF (full document or fragment, e.g. "<h1>Report</h1><p>Content here</p>")'),
  fileName: z.string().optional().describe('Output filename (e.g. "report.pdf")'),
  options: z.object({
    landscape: z.boolean().optional().describe('Landscape orientation (default false)'),
    printBackground: z.boolean().optional().describe('Render background colors and images (default true)'),
    displayHeaderFooter: z.boolean().optional().describe('Show header/footer (default false)'),
    headerTemplate: z.string().optional().describe('HTML template for page header'),
    footerTemplate: z.string().optional().describe('HTML template for page footer'),
    paperWidth: z.number().optional().describe('Page width in inches (default 8.27 for A4)'),
    paperHeight: z.number().optional().describe('Page height in inches (default 11.69 for A4)'),
    marginTop: z.number().optional().describe('Top margin in inches (default 0.4)'),
    marginBottom: z.number().optional().describe('Bottom margin in inches (default 0.4)'),
  }).strip().optional().describe('PDF rendering options (page size, margins, header/footer)'),
}).strip();

const fromUrl = z.object({
  url: z.string().url().describe('URL to capture as PDF (e.g. "https://example.com/report")'),
  fileName: z.string().optional().describe('Output filename (e.g. "snapshot.pdf")'),
  options: z.object({
    landscape: z.boolean().optional().describe('Landscape orientation (default false)'),
    printBackground: z.boolean().optional().describe('Render background colors (default true)'),
    paperWidth: z.number().optional().describe('Page width in inches'),
    paperHeight: z.number().optional().describe('Page height in inches'),
  }).strip().optional().describe('PDF rendering options'),
}).strip();

const merge = z.object({
  urls: z.array(z.string().url()).min(2).max(20).describe('Ordered list of PDF URLs to merge (2-20 URLs)'),
  fileName: z.string().optional().describe('Output filename for merged PDF (e.g. "combined.pdf")'),
}).strip();

export const api2pdfSchemas: Record<string, ZodSchema> = {
  'pdf.from_html': fromHtml,
  'pdf.from_url': fromUrl,
  'pdf.merge': merge,
};
