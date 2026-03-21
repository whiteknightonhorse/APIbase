import { BaseAdapter } from '../base.adapter';
import { type ProviderRequest, type ProviderRawResponse, ProviderErrorCode } from '../../types/provider';

export class RandomUserAdapter extends BaseAdapter {
  constructor() { super({ provider: 'randomuser', baseUrl: 'https://randomuser.me/api' }); }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    if (req.toolId !== 'random.user') throw { code: ProviderErrorCode.INVALID_RESPONSE, httpStatus: 502, message: `Unsupported: ${req.toolId}`, provider: this.provider, toolId: req.toolId, durationMs: 0 };
    const qs = new URLSearchParams();
    qs.set('results', String(Math.min(Number(p.count ?? 1), 20)));
    if (p.nationality) qs.set('nat', String(p.nationality));
    if (p.gender) qs.set('gender', String(p.gender));
    return { url: `${this.baseUrl}/?${qs}`, method: 'GET', headers: { Accept: 'application/json' } };
  }

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;
    const results = (body.results ?? []) as Array<Record<string, unknown>>;
    return { count: results.length, users: results.map(u => {
      const name = (u.name ?? {}) as Record<string, unknown>;
      const loc = (u.location ?? {}) as Record<string, unknown>;
      const dob = (u.dob ?? {}) as Record<string, unknown>;
      const pic = (u.picture ?? {}) as Record<string, unknown>;
      return { first_name: name.first, last_name: name.last, email: u.email, phone: u.phone, gender: u.gender, age: dob.age, city: loc.city, state: loc.state, country: loc.country, photo: pic.large, uuid: (u.login as Record<string, unknown>)?.uuid };
    })};
  }
}
