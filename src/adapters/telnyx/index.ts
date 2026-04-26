import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/**
 * Telnyx adapter (UC-395) — geo-tiered pricing for SMS.
 *
 * Telnyx wholesale rates vary by destination country (US ~$0.009 vs RU ~$0.10+).
 * APIbase pipeline charges a fixed price per tool_id, so we expose THREE send
 * tools mapped to three price tiers — each with a guaranteed >=33% margin.
 *
 * Tier 1  send_sms_na       NANP (+1)               cost ~$0.009  →  $0.012  (33% margin)
 * Tier 2  send_sms_world    EU + APAC core + LATAM  cost ~$0.04-0.07 → $0.10  (43-150% margin)
 * Tier 3  send_sms_premium  CIS + CN + MENA + AF +  cost ~$0.10-0.18 → $0.25  (39-150% margin)
 *                           default for unknown
 *
 * Each tool validates the destination prefix and returns 400 with a clear
 * "use telnyx.send_sms_X instead" error if the agent picked the wrong tier.
 */

type Tier = 'na' | 'world' | 'premium';

// Tier 2 — World — explicit prefix list (most-specific first; +44, +49 etc.)
// Order matters because some prefixes are nested (e.g. +351 vs +35).
const WORLD_PREFIXES = [
  // Europe (multi-digit first)
  '+352',
  '+353',
  '+354',
  '+356',
  '+358',
  '+359',
  '+371',
  '+370',
  '+372',
  '+382',
  '+381',
  '+389',
  '+387',
  '+385',
  '+386',
  '+420',
  '+421',
  // Europe (2-digit)
  '+30',
  '+31',
  '+32',
  '+33',
  '+34',
  '+36',
  '+39',
  '+40',
  '+41',
  '+43',
  '+44',
  '+45',
  '+46',
  '+47',
  '+48',
  '+49',
  '+351',
  // APAC + MEA core
  '+60',
  '+61',
  '+62',
  '+63',
  '+64',
  '+65',
  '+66',
  '+81',
  '+82',
  '+84',
  '+91',
  '+852',
  '+886',
  '+972',
  '+971',
  // LATAM core
  '+52',
  '+54',
  '+55',
  '+56',
  '+57',
  '+58',
  '+506',
  '+507',
  // Africa core
  '+27',
];

// Tier 3 — Premium — explicit list (CIS, CN, MENA, Africa premium, etc.)
// Anything NOT in tier 1 or tier 2 falls through to premium by default.
const PREMIUM_PREFIXES = [
  '+7', // Russia, Kazakhstan
  '+20', // Egypt
  '+86', // China
  '+90', // Turkey
  '+93', // Afghanistan
  '+98', // Iran
  '+212', // Morocco
  '+216', // Tunisia
  '+213', // Algeria
  '+218', // Libya
  '+233', // Ghana
  '+234', // Nigeria
  '+254', // Kenya
  '+255', // Tanzania
  '+256', // Uganda
  '+260', // Zambia
  '+263', // Zimbabwe
  '+880', // Bangladesh
  '+92', // Pakistan
  '+94', // Sri Lanka
  '+95', // Myanmar
  '+962', // Jordan
  '+963', // Syria
  '+964', // Iraq
  '+965', // Kuwait
  '+966', // Saudi Arabia
  '+967', // Yemen
  '+968', // Oman
  '+973', // Bahrain
  '+974', // Qatar
  '+977', // Nepal
  '+994', // Azerbaijan
  '+995', // Georgia
  '+374', // Armenia
  '+373', // Moldova
  '+375', // Belarus
  '+380', // Ukraine
];

function classifyDestination(to: string): Tier {
  const trimmed = to.trim();
  if (!trimmed.startsWith('+')) return 'premium'; // require E.164
  // Tier 1 — NANP +1 followed by 10 digits
  if (/^\+1\d{10}$/.test(trimmed)) return 'na';
  // Tier 3 — Premium explicit list (check before tier 2 to avoid +7 / +44 confusion)
  for (const pre of PREMIUM_PREFIXES) {
    if (trimmed.startsWith(pre)) return 'premium';
  }
  // Tier 2 — World explicit list
  for (const pre of WORLD_PREFIXES) {
    if (trimmed.startsWith(pre)) return 'world';
  }
  // Unknown prefix → premium (safe default — never lose money)
  return 'premium';
}

const TIER_TOOL_PRICE: Record<Tier, { tool: string; price: string }> = {
  na: { tool: 'telnyx.send_sms_na', price: '$0.012' },
  world: { tool: 'telnyx.send_sms_world', price: '$0.10' },
  premium: { tool: 'telnyx.send_sms_premium', price: '$0.25' },
};

/**
 * Telnyx adapter (UC-395).
 * SMS + Voice (CPaaS), v2 REST API.
 * Auth: Bearer API Key v2 (KEY01...).
 * Trial: $10 credit. ToS AUP explicitly permits ISV resale of A2P messaging + voice.
 */
export class TelnyxAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'telnyx', baseUrl: 'https://api.telnyx.com' });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const baseHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };

    // Validate tier for any send tool. All three send tools share the same
    // outgoing HTTP request; the only difference is the price the platform
    // already charged at ESCROW (set in tool_provider_config.yaml).
    const sendTier: Tier | null =
      req.toolId === 'telnyx.send_sms_na'
        ? 'na'
        : req.toolId === 'telnyx.send_sms_world'
          ? 'world'
          : req.toolId === 'telnyx.send_sms_premium'
            ? 'premium'
            : null;

    if (sendTier !== null) {
      const to = String(p.to ?? '');
      const actualTier = classifyDestination(to);
      if (actualTier !== sendTier) {
        const correct = TIER_TOOL_PRICE[actualTier];
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 400,
          message: `Destination ${to} is in '${actualTier}' tier — use ${correct.tool} (${correct.price}/SMS) instead. Tiers: na=NANP +1 ($0.012); world=EU/APAC/LATAM core ($0.10); premium=CIS/CN/MENA/Africa/unknown ($0.25).`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
      }
      const body: Record<string, unknown> = {
        to,
        from: String(p.from),
        text: String(p.text),
      };
      if (p.messaging_profile_id) body.messaging_profile_id = String(p.messaging_profile_id);
      return {
        url: `${this.baseUrl}/v2/messages`,
        method: 'POST',
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      };
    }

    switch (req.toolId) {
      case 'telnyx.message_status': {
        const id = encodeURIComponent(String(p.message_id));
        return {
          url: `${this.baseUrl}/v2/messages/${id}`,
          method: 'GET',
          headers: baseHeaders,
        };
      }
      case 'telnyx.list_messages': {
        // Telnyx uses Detail Records (MDR) for message history, not /v2/messages
        const qs = new URLSearchParams();
        qs.set('filter[record_type]', 'mdr');
        if (p.limit !== undefined && p.limit !== null) qs.set('page[size]', String(p.limit));
        if (p.direction) qs.set('filter[direction]', String(p.direction));
        if (p.date_from) qs.set('filter[date][gte]', String(p.date_from));
        return {
          url: `${this.baseUrl}/v2/detail_records?${qs.toString()}`,
          method: 'GET',
          headers: baseHeaders,
        };
      }
      case 'telnyx.balance':
        return {
          url: `${this.baseUrl}/v2/balance`,
          method: 'GET',
          headers: baseHeaders,
        };
      case 'telnyx.estimate_price': {
        // Synthetic tool — no upstream call. Returned by parseResponse from a static dummy fetch.
        // We point at /v2/balance (cheap, always returns 200) and ignore its body.
        return {
          url: `${this.baseUrl}/v2/balance`,
          method: 'GET',
          headers: baseHeaders,
        };
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    const data = (body.data as Record<string, unknown>) ?? {};

    // Send tools — all three share the same response shape.
    if (
      req.toolId === 'telnyx.send_sms_na' ||
      req.toolId === 'telnyx.send_sms_world' ||
      req.toolId === 'telnyx.send_sms_premium'
    ) {
      const errors = data.errors as Array<Record<string, unknown>> | undefined;
      const fromObj = (data.from as Record<string, unknown>) ?? {};
      const toArr = (data.to as Array<Record<string, unknown>>) ?? [];
      return {
        message_id: data.id,
        direction: data.direction,
        type: data.type,
        from: fromObj.phone_number,
        to: toArr.map((t) => ({ phone_number: t.phone_number, status: t.status })),
        text: data.text,
        parts: data.parts,
        sent_at: data.sent_at,
        created_at: data.created_at,
        cost: data.cost ?? null,
        errors: errors && errors.length > 0 ? errors : null,
      };
    }

    switch (req.toolId) {
      case 'telnyx.message_status': {
        const errors = data.errors as Array<Record<string, unknown>> | undefined;
        const toArr = (data.to as Array<Record<string, unknown>>) ?? [];
        return {
          message_id: data.id,
          direction: data.direction,
          status_per_recipient: toArr.map((t) => ({
            phone_number: t.phone_number,
            status: t.status,
          })),
          sent_at: data.sent_at,
          completed_at: data.completed_at,
          parts: data.parts,
          cost: data.cost ?? null,
          errors: errors && errors.length > 0 ? errors : null,
        };
      }
      case 'telnyx.list_messages': {
        // Telnyx Detail Records (MDR) — flat string fields, not nested objects
        const items = (body.data as Array<Record<string, unknown>>) ?? [];
        const meta = (body.meta as Record<string, unknown>) ?? {};
        return {
          messages: items.map((m) => ({
            message_id: m.id,
            direction: m.direction,
            status: m.status,
            from: m.from,
            to: m.to,
            message_type: m.message_type,
            parts: m.parts,
            rate: m.rate,
            currency: m.currency,
            created_at: m.created_at,
            sent_at: m.sent_at,
            completed_at: m.completed_at,
            country_code: m.country_code,
          })),
          total: meta.total_results ?? items.length,
          page: meta.page_number ?? 1,
        };
      }
      case 'telnyx.balance':
        return {
          balance: data.balance,
          available_credit: data.available_credit,
          currency: data.currency,
          pending: data.pending,
          frozen: data.frozen,
          credit_limit: data.credit_limit,
        };
      case 'telnyx.estimate_price': {
        // Static tier classification — ignores upstream body
        const params = req.params as Record<string, unknown>;
        const to = String(params.to ?? '');
        const tier = classifyDestination(to);
        const meta = TIER_TOOL_PRICE[tier];
        return {
          phone_number: to,
          tier,
          price_usd: meta.price.replace('$', ''),
          tool_to_use: meta.tool,
          tiers: {
            na: {
              tool: 'telnyx.send_sms_na',
              price_usd: '0.012',
              covers: 'NANP (+1) — US, Canada, Caribbean',
            },
            world: {
              tool: 'telnyx.send_sms_world',
              price_usd: '0.10',
              covers: 'EU, APAC core, LATAM core (UK, DE, FR, IN, JP, BR, MX, AU, etc.)',
            },
            premium: {
              tool: 'telnyx.send_sms_premium',
              price_usd: '0.25',
              covers: 'CIS, CN, MENA, Africa, and any unknown destination (default)',
            },
          },
        };
      }
      default:
        return body;
    }
  }
}
