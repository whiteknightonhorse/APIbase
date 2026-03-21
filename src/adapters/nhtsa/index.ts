import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

export class NhtsaAdapter extends BaseAdapter {
  constructor() { super({ provider: 'nhtsa', baseUrl: 'https://vpic.nhtsa.dot.gov/api' }); }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const h: Record<string, string> = { Accept: 'application/json' };
    switch (req.toolId) {
      case 'vin.decode':
        return { url: `${this.baseUrl}/vehicles/decodevinvalues/${encodeURIComponent(String(p.vin))}?format=json`, method: 'GET', headers: h };
      case 'vin.models': {
        const qs = new URLSearchParams(); qs.set('format', 'json');
        if (p.make) qs.set('make', String(p.make));
        if (p.year) qs.set('modelyear', String(p.year));
        return { url: `${this.baseUrl}/vehicles/getmodelsformakeyear?${qs}`, method: 'GET', headers: h };
      }
      default: throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    if (req.toolId === 'vin.decode') {
      const r = ((body.Results ?? []) as Array<Record<string, unknown>>)[0] ?? {};
      return { vin: r.VIN, make: r.Make, model: r.Model, year: r.ModelYear, body_class: r.BodyClass, drive_type: r.DriveType, engine: r.EngineCylinders ? `${r.EngineCylinders}cyl ${r.DisplacementL}L` : null, fuel_type: r.FuelTypePrimary, transmission: r.TransmissionStyle, plant_country: r.PlantCountry, vehicle_type: r.VehicleType };
    }
    const results = (body.Results ?? []) as Array<Record<string, unknown>>;
    return { count: results.length, models: results.slice(0, 50).map(r => ({ make: r.Make_Name, model: r.Model_Name, id: r.Model_ID })) };
  }
}
