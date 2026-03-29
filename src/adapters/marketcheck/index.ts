import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  MCSearchResponse,
  MCListing,
  CarSearchOutput,
  CarListingOutput,
} from './types';

/**
 * MarketCheck Car Listings adapter (UC-231).
 *
 * Supported tools:
 *   carmarket.search  → GET /search/car/active (search active listings)
 *   carmarket.listing → GET /listing/car/{id} (listing details)
 *
 * Auth: api_key query param. Free: 500 calls/month, 5/sec.
 * Millions of US vehicle listings.
 */
export class MarketCheckAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'marketcheck',
      baseUrl: 'https://mc-api.marketcheck.com/v2',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'carmarket.search': {
        const qp = new URLSearchParams();
        qp.set('api_key', this.apiKey);
        if (params.make) qp.set('make', String(params.make));
        if (params.model) qp.set('model', String(params.model));
        if (params.year) qp.set('year', String(params.year));
        if (params.price_min) qp.set('price_range', `${params.price_min}-${params.price_max ?? ''}`);
        else if (params.price_max) qp.set('price_range', `-${params.price_max}`);
        if (params.miles_max) qp.set('miles_range', `-${params.miles_max}`);
        if (params.zip) qp.set('zip', String(params.zip));
        if (params.radius) qp.set('radius', String(params.radius));
        if (params.seller_type) qp.set('seller_type', String(params.seller_type));
        if (params.exterior_color) qp.set('exterior_color', String(params.exterior_color));
        qp.set('rows', String(Math.min(Number(params.limit) || 10, 25)));
        if (params.start) qp.set('start', String(params.start));
        return {
          url: `${this.baseUrl}/search/car/active?${qp.toString()}`,
          method: 'GET',
          headers: {},
        };
      }

      case 'carmarket.listing':
        return {
          url: `${this.baseUrl}/listing/car/${encodeURIComponent(String(params.id))}?api_key=${this.apiKey}`,
          method: 'GET',
          headers: {},
        };

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'carmarket.search':
        return this.parseSearch(body as unknown as MCSearchResponse);
      case 'carmarket.listing':
        return this.parseListing(body as unknown as MCListing);
      default:
        return body;
    }
  }

  private parseSearch(body: MCSearchResponse): CarSearchOutput {
    return {
      total: body.num_found ?? 0,
      listings: (body.listings ?? []).map((l) => ({
        id: l.id ?? '',
        vin: l.vin ?? '',
        heading: l.heading ?? '',
        price: l.price ?? 0,
        miles: l.miles ?? 0,
        year: l.build?.year ?? 0,
        make: l.build?.make ?? '',
        model: l.build?.model ?? '',
        trim: l.build?.trim ?? '',
        exterior_color: l.exterior_color ?? '',
        seller_type: l.seller_type ?? '',
        dealer_name: l.dealer?.name ?? '',
        dealer_city: l.dealer?.city ?? '',
        dealer_state: l.dealer?.state ?? '',
        listing_url: l.vdp_url ?? '',
        days_on_market: l.dom_active ?? l.dom ?? 0,
        carfax_clean_title: l.carfax_clean_title ?? false,
      })),
    };
  }

  private parseListing(l: MCListing): CarListingOutput {
    return {
      id: l.id ?? '',
      vin: l.vin ?? '',
      heading: l.heading ?? '',
      price: l.price ?? 0,
      msrp: l.msrp ?? 0,
      miles: l.miles ?? 0,
      year: l.build?.year ?? 0,
      make: l.build?.make ?? '',
      model: l.build?.model ?? '',
      trim: l.build?.trim ?? '',
      body_type: l.build?.body_type ?? '',
      drivetrain: l.build?.drivetrain ?? '',
      transmission: l.build?.transmission ?? '',
      engine: l.build?.engine ?? '',
      fuel_type: l.build?.fuel_type ?? '',
      exterior_color: l.exterior_color ?? '',
      interior_color: l.interior_color ?? '',
      doors: l.build?.doors ?? 0,
      seller_type: l.seller_type ?? '',
      dealer_name: l.dealer?.name ?? '',
      dealer_city: l.dealer?.city ?? '',
      dealer_state: l.dealer?.state ?? '',
      dealer_phone: l.dealer?.phone ?? '',
      listing_url: l.vdp_url ?? '',
      days_on_market: l.dom_active ?? l.dom ?? 0,
      carfax_1_owner: l.carfax_1_owner ?? false,
      carfax_clean_title: l.carfax_clean_title ?? false,
      photos: l.media?.photo_links ?? [],
    };
  }
}
