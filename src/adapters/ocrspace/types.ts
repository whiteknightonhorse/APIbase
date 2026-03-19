/**
 * OCR.space API response types (UC-078).
 *
 * API host: api.ocr.space
 * Auth: apikey header
 */

export interface OcrParsedResult {
  TextOverlay: unknown;
  TextOrientation: string;
  FileParseExitCode: number;
  ParsedText: string;
  ErrorMessage: string;
  ErrorDetails: string;
}

export interface OcrResponse {
  OCRExitCode: number;
  IsErroredOnProcessing: boolean;
  ParsedResults: OcrParsedResult[];
  ProcessingTimeInMilliseconds: string;
  ErrorMessage?: string[];
  SearchablePDFURL?: string;
}
