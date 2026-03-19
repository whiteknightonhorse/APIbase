import { z, type ZodSchema } from 'zod';

const extractText = z
  .object({
    url: z.string().url().describe('URL of the image or PDF to extract text from (PNG, JPG, GIF, BMP, PDF, TIFF supported)'),
    language: z
      .enum(['eng', 'ara', 'chs', 'cht', 'dan', 'dut', 'fin', 'fre', 'ger', 'gre', 'hun', 'ita', 'jpn', 'kor', 'nor', 'pol', 'por', 'rus', 'spa', 'swe', 'tur'])
      .optional()
      .describe('OCR language: "eng" (English, default), "rus" (Russian), "ger" (German), "fre" (French), "spa" (Spanish), "jpn" (Japanese), "kor" (Korean), "chs" (Chinese Simplified)'),
    filetype: z
      .enum(['PNG', 'JPG', 'GIF', 'BMP', 'PDF', 'TIFF'])
      .optional()
      .describe('File type hint — set if URL has no extension or content-type is wrong'),
    detect_orientation: z
      .boolean()
      .optional()
      .describe('Auto-detect and correct image orientation (default false)'),
  })
  .strip();

export const ocrspaceSchemas: Record<string, ZodSchema> = {
  'ocr.extract_text': extractText,
};
