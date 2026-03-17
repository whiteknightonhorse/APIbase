/**
 * QRServer API response types (UC-040).
 *
 * API host: api.qrserver.com
 * Auth: None (open access, no API key, no rate limits)
 *
 * Note: /v1/create-qr-code/ returns PNG binary, not JSON.
 * The adapter returns a structured URL response instead.
 * /v1/read-qr-code/ returns JSON array.
 */

// ---------------------------------------------------------------------------
// Generate QR Code — structured response (not from API)
// ---------------------------------------------------------------------------

export interface QrGenerateResponse {
  url: string;
  data: string;
  size: string;
  format: string;
  color: string;
  bgcolor: string;
  margin: number;
  ecc: string;
}

// ---------------------------------------------------------------------------
// Read QR Code (/v1/read-qr-code/) — API response
// ---------------------------------------------------------------------------

export interface QrReadSymbol {
  seq: number;
  data: string;
  error: string | null;
}

export interface QrReadResult {
  type: string;
  symbol: QrReadSymbol[];
}

export type QrReadApiResponse = QrReadResult[];

export interface QrReadResponse {
  type: string;
  data: string;
  error: string | null;
}
