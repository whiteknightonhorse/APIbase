import { logger } from '../../config/logger';

/**
 * Sabre OAuth2 token manager (UC-023).
 *
 * Sabre uses a non-standard "double base64" encoding for client credentials:
 *   step1 = base64(clientId)
 *   step2 = base64(clientSecret)
 *   step3 = base64(step1 + ":" + step2)
 *   Authorization: Basic {step3}
 *
 * Token TTL: 604,800s (7 days). Refresh buffer: 300s.
 * Token is cached in memory and auto-refreshed on expiry.
 */

const TOKEN_REFRESH_BUFFER_S = 300;

interface TokenData {
  accessToken: string;
  expiresAt: number; // Unix timestamp (ms)
}

export class SabreAuth {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokenUrl: string;
  private cachedToken: TokenData | null = null;
  private pendingRefresh: Promise<string> | null = null;

  constructor(clientId: string, clientSecret: string, baseUrl: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.tokenUrl = `${baseUrl}/v2/auth/token`;
  }

  /**
   * Get a valid Bearer token. Returns cached token if still valid,
   * otherwise fetches a new one. Coalesces concurrent refresh requests.
   */
  async getToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.accessToken;
    }

    // Coalesce concurrent token requests
    if (this.pendingRefresh) {
      return this.pendingRefresh;
    }

    this.pendingRefresh = this.fetchToken();
    try {
      const token = await this.pendingRefresh;
      return token;
    } finally {
      this.pendingRefresh = null;
    }
  }

  private async fetchToken(): Promise<string> {
    // Double base64 encoding per Sabre spec
    const encodedClientId = Buffer.from(this.clientId).toString('base64');
    const encodedClientSecret = Buffer.from(this.clientSecret).toString('base64');
    const credentials = Buffer.from(`${encodedClientId}:${encodedClientSecret}`).toString('base64');

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error(
        { status: response.status, body: body.slice(0, 200) },
        'Sabre OAuth2 token request failed',
      );
      throw new Error(`Sabre auth failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    if (!data.access_token) {
      throw new Error('Sabre auth response missing access_token');
    }

    const expiresInMs = (data.expires_in - TOKEN_REFRESH_BUFFER_S) * 1_000;
    this.cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + expiresInMs,
    };

    logger.info(
      { expires_in: data.expires_in, token_type: data.token_type },
      'Sabre OAuth2 token obtained',
    );

    return data.access_token;
  }
}
