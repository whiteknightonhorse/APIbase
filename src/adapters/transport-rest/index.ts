import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

interface TransportRestProduct {
  suburban?: boolean;
  subway?: boolean;
  tram?: boolean;
  bus?: boolean;
  ferry?: boolean;
  express?: boolean;
  regional?: boolean;
}

interface TransportRestLocation {
  type: string;
  id?: string;
  name?: string;
  address?: string;
  location?: { latitude?: number; longitude?: number };
  latitude?: number;
  longitude?: number;
  products?: TransportRestProduct;
  distance?: number;
}

interface TransportRestLine {
  name?: string;
  productName?: string;
  mode?: string;
  product?: string;
  operator?: { name?: string };
}

interface TransportRestDeparture {
  tripId?: string;
  when?: string | null;
  plannedWhen?: string | null;
  delay?: number | null;
  platform?: string | null;
  plannedPlatform?: string | null;
  direction?: string | null;
  line?: TransportRestLine;
  cancelled?: boolean;
}

interface TransportRestLeg {
  origin?: TransportRestLocation;
  destination?: TransportRestLocation;
  departure?: string | null;
  plannedDeparture?: string | null;
  arrival?: string | null;
  plannedArrival?: string | null;
  departureDelay?: number | null;
  arrivalDelay?: number | null;
  departurePlatform?: string | null;
  arrivalPlatform?: string | null;
  line?: TransportRestLine;
  direction?: string | null;
  walking?: boolean;
}

interface TransportRestJourney {
  legs?: TransportRestLeg[];
  price?: { amount?: number; currency?: string } | null;
}

function activeProducts(products?: TransportRestProduct): string[] {
  if (!products) return [];
  return Object.entries(products)
    .filter(([, active]) => active === true)
    .map(([mode]) => mode);
}

function locationLat(loc?: TransportRestLocation): number | null {
  return loc?.location?.latitude ?? loc?.latitude ?? null;
}

function locationLon(loc?: TransportRestLocation): number | null {
  return loc?.location?.longitude ?? loc?.longitude ?? null;
}

function summarizeLocation(loc?: TransportRestLocation) {
  if (!loc) return null;
  return {
    id: loc.id ?? null,
    type: loc.type,
    name: loc.name ?? loc.address ?? null,
    latitude: locationLat(loc),
    longitude: locationLon(loc),
  };
}

/**
 * transport.rest adapter (UC-626) — public transit (stops, departures, journeys,
 * nearby stations) for Berlin/Brandenburg via BVG, backed by the community-run
 * v6.bvg.transport.rest HAFAS wrapper. No auth. https://v6.bvg.transport.rest/
 * NOTE: v6.db.transport.rest (nationwide DB) and v6.vbb.transport.rest reject
 * TLS handshakes from this datacenter (server-side TLS alert, not a client bug) —
 * v6.bvg.transport.rest was verified live and reachable, so it is the sole upstream.
 */
export class TransportRestAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'transport-rest',
      baseUrl: 'https://v6.bvg.transport.rest',
      maxResponseBytes: 3_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'transport-rest.location_search': {
        const qs = new URLSearchParams();
        qs.set('query', String(p.query));
        qs.set('results', String(Math.max(1, Math.min(50, Number(p.results ?? 10)))));
        qs.set('poi', p.include_poi ? 'true' : 'false');
        qs.set('addresses', p.include_addresses ? 'true' : 'false');
        return {
          url: `${this.baseUrl}/locations?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'transport-rest.nearby_stops': {
        const qs = new URLSearchParams();
        qs.set('latitude', String(p.latitude));
        qs.set('longitude', String(p.longitude));
        qs.set('results', String(Math.max(1, Math.min(50, Number(p.results ?? 8)))));
        if (p.max_distance_meters) qs.set('distance', String(p.max_distance_meters));
        return {
          url: `${this.baseUrl}/locations/nearby?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'transport-rest.stop_departures': {
        const qs = new URLSearchParams();
        qs.set('duration', String(Math.max(1, Math.min(180, Number(p.duration_minutes ?? 60)))));
        qs.set('results', String(Math.max(1, Math.min(100, Number(p.results ?? 20)))));
        if (p.when) qs.set('when', String(p.when));
        return {
          url: `${this.baseUrl}/stops/${encodeURIComponent(String(p.stop_id))}/departures?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }
      case 'transport-rest.journey_search': {
        const qs = new URLSearchParams();
        qs.set('from', String(p.from_stop_id));
        qs.set('to', String(p.to_stop_id));
        if (p.departure) qs.set('departure', String(p.departure));
        if (p.arrival) qs.set('arrival', String(p.arrival));
        qs.set('results', String(Math.max(1, Math.min(10, Number(p.results ?? 3)))));
        return {
          url: `${this.baseUrl}/journeys?${qs.toString()}`,
          method: 'GET',
          headers,
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
    const body = raw.body;

    switch (req.toolId) {
      case 'transport-rest.location_search': {
        const list = (body as TransportRestLocation[]) ?? [];
        return {
          query: (req.params as Record<string, unknown>).query,
          count: list.length,
          locations: list.map((loc) => ({
            id: loc.id ?? null,
            type: loc.type,
            name: loc.name ?? loc.address ?? null,
            latitude: locationLat(loc),
            longitude: locationLon(loc),
            products: activeProducts(loc.products),
          })),
        };
      }
      case 'transport-rest.nearby_stops': {
        const list = (body as TransportRestLocation[]) ?? [];
        const params = req.params as Record<string, unknown>;
        return {
          latitude: params.latitude,
          longitude: params.longitude,
          count: list.length,
          stops: list.map((loc) => ({
            id: loc.id ?? null,
            type: loc.type,
            name: loc.name ?? loc.address ?? null,
            latitude: locationLat(loc),
            longitude: locationLon(loc),
            distance_meters: loc.distance ?? null,
            products: activeProducts(loc.products),
          })),
        };
      }
      case 'transport-rest.stop_departures': {
        const parsed = body as { departures?: TransportRestDeparture[] };
        const list = parsed.departures ?? [];
        return {
          stop_id: (req.params as Record<string, unknown>).stop_id,
          count: list.length,
          departures: list.map((d) => ({
            trip_id: d.tripId ?? null,
            line: d.line?.name ?? null,
            mode: d.line?.product ?? d.line?.mode ?? null,
            operator: d.line?.operator?.name ?? null,
            direction: d.direction ?? null,
            when: d.when ?? null,
            planned_when: d.plannedWhen ?? null,
            delay_seconds: d.delay ?? null,
            platform: d.platform ?? d.plannedPlatform ?? null,
            cancelled: d.cancelled === true,
          })),
        };
      }
      case 'transport-rest.journey_search': {
        const parsed = body as { journeys?: TransportRestJourney[] };
        const list = parsed.journeys ?? [];
        return {
          from: (req.params as Record<string, unknown>).from_stop_id,
          to: (req.params as Record<string, unknown>).to_stop_id,
          count: list.length,
          journeys: list.map((j) => {
            const legs = j.legs ?? [];
            const firstLeg = legs[0];
            const lastLeg = legs[legs.length - 1];
            const departure = firstLeg?.departure ?? null;
            const arrival = lastLeg?.arrival ?? null;
            let durationMinutes: number | null = null;
            if (departure && arrival) {
              const diffMs = new Date(arrival).getTime() - new Date(departure).getTime();
              durationMinutes = Number.isFinite(diffMs) ? Math.round(diffMs / 60000) : null;
            }
            return {
              departure,
              arrival,
              duration_minutes: durationMinutes,
              transfers: Math.max(0, legs.filter((leg) => !leg.walking).length - 1),
              price_amount: j.price?.amount ?? null,
              price_currency: j.price?.currency ?? null,
              legs: legs.map((leg) => ({
                mode: leg.line?.product ?? (leg.walking ? 'walking' : null),
                line: leg.line?.name ?? null,
                direction: leg.direction ?? null,
                origin: summarizeLocation(leg.origin),
                destination: summarizeLocation(leg.destination),
                departure: leg.departure ?? null,
                arrival: leg.arrival ?? null,
                departure_delay_seconds: leg.departureDelay ?? null,
                arrival_delay_seconds: leg.arrivalDelay ?? null,
              })),
            };
          }),
        };
      }
      default:
        return body;
    }
  }
}
