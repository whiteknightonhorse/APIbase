import { BaseAdapter } from '../base.adapter';
import { ProviderErrorCode } from '../../types/provider';
import type { ProviderRequest, ProviderRawResponse } from '../../types/provider';

// T-0629: domain_register sells at a flat $23.00, so it may only register 1-year,
// non-premium domains whose live price keeps price >= cost x 1.3 (23 / 1.3 = 17.69).
const MAX_REGISTER_COST_USD = 17.69;
const ALLOWED_TLDS = ['com', 'net', 'org', 'dev', 'app', 'xyz'];

export class NameSiloAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'namesilo', baseUrl: 'https://www.namesilo.com', maxRetries: 1 });
    this.apiKey = apiKey;
  }

  /**
   * Pre-call guard for domain_register. Every refusal throws before any registerDomain
   * request is sent (nothing is debited) and as a ProviderError, so the call is not billed.
   */
  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    if (req.toolId === 'namesilo.domain_register') {
      await this.guardRegister(req);
    }
    return super.call(req);
  }

  private refuse(req: ProviderRequest, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId: req.toolId,
      durationMs: 0,
    };
  }

  private async guardRegister(req: ProviderRequest): Promise<void> {
    const params = (req.params ?? {}) as Record<string, unknown>;
    if ((params.years ?? 1) !== 1) {
      this.refuse(req, 'domain_register sells 1-year registrations only (years must be 1)');
    }
    const domain = typeof params.domain === 'string' ? params.domain.trim().toLowerCase() : '';
    const m = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,})$/.exec(domain);
    const tld = m ? m[1] : '';
    if (!ALLOWED_TLDS.includes(tld) || domain.split('.').length !== 2) {
      this.refuse(
        req,
        `domain_register supports only second-level domains in .${ALLOWED_TLDS.join(' .')}`,
      );
    }

    const check = await super.call({
      toolId: 'namesilo.domain_check',
      params: { domains: domain },
      requestId: req.requestId,
      agentId: req.agentId,
    });
    // call() wraps the parsed parseResponse() result: the availability list sits at body.body.
    const parsed = ((check.body ?? {}) as { body?: unknown }).body ?? check.body;
    const body = (parsed ?? {}) as { available?: Array<Record<string, unknown>> };
    const hit = (body.available ?? []).find((d) => d.domain === domain);
    if (!hit) {
      this.refuse(req, `Domain ${domain} is not available for registration`);
    }
    const price = Number(hit.price_usd);
    if (hit.premium === true) {
      this.refuse(req, `Domain ${domain} is a premium domain; premium domains are refused`);
    }
    if (!Number.isFinite(price) || price > MAX_REGISTER_COST_USD) {
      this.refuse(
        req,
        `Live registration price for ${domain} exceeds the allowed maximum of $${MAX_REGISTER_COST_USD}`,
      );
    }
  }

  buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const base = 'https://www.namesilo.com/api';
    const qs = `version=1&type=json&key=${this.apiKey}`;

    switch (req.toolId) {
      case 'namesilo.domain_check': {
        const domains = String(params.domains ?? '');
        return {
          url: `${base}/checkRegisterAvailability?${qs}&domains=${encodeURIComponent(domains)}`,
          method: 'GET',
          headers: {},
        };
      }

      case 'namesilo.domain_register': {
        const domain = String(params.domain ?? '');
        const years = 1;
        const priv = params.private !== false ? 1 : 0;
        return {
          url: `${base}/registerDomain?${qs}&domain=${encodeURIComponent(domain)}&years=${years}&private=${priv}&auto_renew=0`,
          method: 'GET',
          headers: {},
        };
      }

      case 'namesilo.domain_list': {
        return { url: `${base}/listDomains?${qs}`, method: 'GET', headers: {} };
      }

      case 'namesilo.domain_info': {
        const domain = String(params.domain ?? '');
        return {
          url: `${base}/getDomainInfo?${qs}&domain=${encodeURIComponent(domain)}`,
          method: 'GET',
          headers: {},
        };
      }

      case 'namesilo.get_prices': {
        return { url: `${base}/getPrices?${qs}`, method: 'GET', headers: {} };
      }

      default:
        throw new Error(`Unknown tool: ${req.toolId}`);
    }
  }

  parseResponse(raw: ProviderRawResponse, req: ProviderRequest): ProviderRawResponse {
    const body = typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body;
    const reply = body?.reply;

    if (!reply || (reply.code && reply.code !== 300)) {
      return {
        ...raw,
        status: 502,
        body: { error: reply?.detail ?? 'NameSilo request failed', code: reply?.code },
      };
    }

    if (req.toolId === 'namesilo.domain_check') {
      const available = reply.available
        ? Array.isArray(reply.available)
          ? reply.available
          : [reply.available]
        : [];
      const unavailable = reply.unavailable
        ? Array.isArray(reply.unavailable)
          ? reply.unavailable
          : [reply.unavailable]
        : [];
      return {
        ...raw,
        body: {
          available: available.map((d: Record<string, unknown>) => ({
            domain: d.domain,
            price_usd: d.price,
            renew_usd: d.renew,
            premium: d.premium === 1,
          })),
          unavailable: unavailable.map((d: unknown) =>
            typeof d === 'string' ? d : (d as Record<string, unknown>).domain,
          ),
        },
      };
    }

    if (req.toolId === 'namesilo.domain_register') {
      return {
        ...raw,
        body: {
          success: true,
          domain: reply.domain,
          order_id: reply.order_amount ? reply.order_amount : null,
          message: reply.detail,
        },
      };
    }

    if (req.toolId === 'namesilo.domain_list') {
      const domains = reply.domains?.domain;
      const list = domains ? (Array.isArray(domains) ? domains : [domains]) : [];
      return { ...raw, body: { domains: list, count: list.length } };
    }

    if (req.toolId === 'namesilo.domain_info') {
      return {
        ...raw,
        body: {
          domain: reply.domain,
          created: reply.created,
          expires: reply.expires,
          status: reply.status,
          locked: reply.locked === 'Yes',
          auto_renew: reply.auto_renew === 'Yes',
          nameservers: reply.nameservers
            ? Array.isArray(reply.nameservers.nameserver)
              ? reply.nameservers.nameserver
              : [reply.nameservers.nameserver]
            : [],
          contact_id: reply.contact_id,
        },
      };
    }

    if (req.toolId === 'namesilo.get_prices') {
      const prices: Record<string, unknown>[] = [];
      const popular = [
        'com',
        'net',
        'org',
        'io',
        'dev',
        'app',
        'ai',
        'co',
        'xyz',
        'me',
        'info',
        'biz',
        'pro',
        'tech',
        'online',
        'store',
        'site',
      ];
      for (const tld of popular) {
        const t = reply[tld];
        if (t) {
          prices.push({
            tld: `.${tld}`,
            register_usd: t.registration,
            renew_usd: t.renew,
            transfer_usd: t.transfer,
          });
        }
      }
      return {
        ...raw,
        body: {
          prices,
          tld_count: Object.keys(reply).filter((k) => k !== 'code' && k !== 'detail').length,
        },
      };
    }

    return raw;
  }
}
