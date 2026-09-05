import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';

/** Dog CEO API (dog.ceo) — free, no-auth, open-source dog image database. */
export class DogCeoAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'dogceo', baseUrl: 'https://dog.ceo/api' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'dogceo.random_image': {
        const breed = p.breed ? String(p.breed).toLowerCase().trim() : undefined;
        const subBreed = p.sub_breed ? String(p.sub_breed).toLowerCase().trim() : undefined;
        const count =
          p.count !== undefined ? Math.min(Math.max(Number(p.count), 1), 50) : undefined;

        let path: string;
        if (breed && subBreed) {
          path = `/breed/${encodeURIComponent(breed)}/${encodeURIComponent(subBreed)}/images/random`;
        } else if (breed) {
          path = `/breed/${encodeURIComponent(breed)}/images/random`;
        } else {
          path = '/breeds/image/random';
        }
        if (count && count > 1) path += `/${count}`;

        return {
          url: `${this.baseUrl}${path}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case 'dogceo.breeds_list':
        return {
          url: `${this.baseUrl}/breeds/list/all`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };

      case 'dogceo.sub_breeds': {
        const breed = String(p.breed ?? '')
          .toLowerCase()
          .trim();
        return {
          url: `${this.baseUrl}/breed/${encodeURIComponent(breed)}/list`,
          method: 'GET',
          headers: { Accept: 'application/json' },
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
    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'dogceo.random_image': {
        const message = body.message;
        const images = Array.isArray(message) ? message : [message];
        return { count: images.length, images };
      }

      case 'dogceo.breeds_list': {
        const breeds = (body.message ?? {}) as Record<string, string[]>;
        const includeSubBreeds = p.include_sub_breeds !== false;
        return {
          breed_count: Object.keys(breeds).length,
          breeds: includeSubBreeds ? breeds : Object.keys(breeds),
        };
      }

      case 'dogceo.sub_breeds': {
        const subBreeds = (body.message ?? []) as string[];
        return { breed: p.breed, sub_breed_count: subBreeds.length, sub_breeds: subBreeds };
      }

      default:
        return body;
    }
  }
}
