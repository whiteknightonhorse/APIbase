/**
 * Zyte API Web Scraping types (UC-233).
 * Cheapest PAYG web scraping — single endpoint, multiple modes.
 */

export interface ZyteExtractResponse {
  url: string;
  statusCode: number;
  httpResponseBody?: string; // base64
  browserHtml?: string;
  screenshot?: string; // base64 PNG
}

export interface ScrapeExtractOutput {
  url: string;
  status_code: number;
  html: string;
  content_length: number;
}

export interface ScrapeBrowserOutput {
  url: string;
  status_code: number;
  html: string;
  content_length: number;
}

export interface ScrapeScreenshotOutput {
  url: string;
  status_code: number;
  screenshot_base64: string;
  size_kb: number;
}
