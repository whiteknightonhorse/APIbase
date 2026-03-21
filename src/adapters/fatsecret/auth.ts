/**
 * FatSecret OAuth 2.0 Client Credentials token manager.
 * Token TTL = 86400s (24h). We refresh at 80% of TTL.
 */
export class FatSecretAuth {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private token: string | null = null;
  private expiresAt = 0;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt) {
      return this.token;
    }

    const creds = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=basic',
    });

    if (!res.ok) {
      throw new Error(`FatSecret OAuth token failed: ${res.status}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = data.access_token;
    // Refresh at 80% of TTL
    this.expiresAt = Date.now() + data.expires_in * 800;
    return this.token;
  }
}
