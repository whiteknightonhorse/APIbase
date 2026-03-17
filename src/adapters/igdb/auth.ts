import { logger } from '../../config/logger';

/**
 * Twitch OAuth2 token manager for IGDB (UC-039).
 *
 * Client Credentials flow:
 *   POST https://id.twitch.tv/oauth2/token
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: grant_type=client_credentials&client_id={ID}&client_secret={SECRET}
 *
 * Token TTL: ~5,184,000s (~60 days). Refresh buffer: 300s.
 * Token is cached in memory and auto-refreshed on expiry.
 */

const TOKEN_REFRESH_BUFFER_S = 300;

interface TokenData {
  accessToken: string;
  expiresAt: number; // Unix timestamp (ms)
}

export class IgdbAuth {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokenUrl = 'https://id.twitch.tv/oauth2/token';
  private cachedToken: TokenData | null = null;
  private pendingRefresh: Promise<string> | null = null;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
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
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      logger.error(
        { status: response.status, body: responseBody.slice(0, 200) },
        'IGDB/Twitch OAuth2 token request failed',
      );
      throw new Error(`IGDB auth failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    if (!data.access_token) {
      throw new Error('IGDB auth response missing access_token');
    }

    const expiresInMs = (data.expires_in - TOKEN_REFRESH_BUFFER_S) * 1_000;
    this.cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + expiresInMs,
    };

    logger.info(
      { expires_in: data.expires_in, token_type: data.token_type },
      'IGDB/Twitch OAuth2 token obtained',
    );

    return data.access_token;
  }
}
