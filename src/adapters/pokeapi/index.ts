import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  PokemonApiResponse,
  PokemonSpeciesApiResponse,
  MoveApiResponse,
  TypeApiResponse,
} from './types';

/**
 * PokéAPI adapter (UC-518).
 *
 * Supported tools (Phase 1, read-only):
 *   pokeapi.pokemon  → GET /api/v2/pokemon/{name_or_id}
 *   pokeapi.species  → GET /api/v2/pokemon-species/{name_or_id}
 *   pokeapi.move     → GET /api/v2/move/{name_or_id}
 *   pokeapi.type     → GET /api/v2/type/{name_or_id}
 *
 * Auth: none — fair-use, free, no registration required.
 * Rate: soft fair-use limit; responses aggressively cached (TTL 86400s).
 */
export class PokeApiAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'pokeapi',
      baseUrl: 'https://pokeapi.co',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'pokeapi.pokemon': {
        const name = encodeURIComponent(String(p.name_or_id).toLowerCase().trim());
        return { url: `${this.baseUrl}/api/v2/pokemon/${name}`, method: 'GET', headers };
      }
      case 'pokeapi.species': {
        const name = encodeURIComponent(String(p.name_or_id).toLowerCase().trim());
        return { url: `${this.baseUrl}/api/v2/pokemon-species/${name}`, method: 'GET', headers };
      }
      case 'pokeapi.move': {
        const name = encodeURIComponent(String(p.name_or_id).toLowerCase().trim());
        return { url: `${this.baseUrl}/api/v2/move/${name}`, method: 'GET', headers };
      }
      case 'pokeapi.type': {
        const name = encodeURIComponent(String(p.name_or_id).toLowerCase().trim());
        return { url: `${this.baseUrl}/api/v2/type/${name}`, method: 'GET', headers };
      }
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
    switch (req.toolId) {
      case 'pokeapi.pokemon':
        return this.parsePokemon(raw.body as PokemonApiResponse);
      case 'pokeapi.species':
        return this.parseSpecies(raw.body as PokemonSpeciesApiResponse);
      case 'pokeapi.move':
        return this.parseMove(raw.body as MoveApiResponse);
      case 'pokeapi.type':
        return this.parseType(raw.body as TypeApiResponse);
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private parsePokemon(d: PokemonApiResponse) {
    return {
      id: d.id,
      name: d.name,
      height_dm: d.height,
      weight_hg: d.weight,
      base_experience: d.base_experience,
      sprite_url: d.sprites.front_default,
      sprite_shiny_url: d.sprites.front_shiny,
      types: d.types.map((t) => t.type.name),
      stats: d.stats.map((s) => ({ name: s.stat.name, base: s.base_stat, effort: s.effort })),
      abilities: d.abilities.map((a) => ({ name: a.ability.name, is_hidden: a.is_hidden })),
      moves: d.moves.slice(0, 20).map((m) => m.move.name),
      move_count: d.moves.length,
      species_name: d.species.name,
    };
  }

  private parseSpecies(d: PokemonSpeciesApiResponse) {
    const englishFlavor = d.flavor_text_entries.find((e) => e.language.name === 'en');
    const englishGenus = d.genera.find((g) => g.language.name === 'en');
    return {
      id: d.id,
      name: d.name,
      genus: englishGenus?.genus ?? null,
      flavor_text: englishFlavor?.flavor_text?.replace(/\f/g, ' ').replace(/\n/g, ' ') ?? null,
      flavor_version: englishFlavor?.version.name ?? null,
      generation: d.generation.name,
      growth_rate: d.growth_rate.name,
      capture_rate: d.capture_rate,
      base_happiness: d.base_happiness,
      gender_rate: d.gender_rate,
      egg_groups: d.egg_groups.map((e) => e.name),
      habitat: d.habitat?.name ?? null,
      color: d.color.name,
      is_baby: d.is_baby,
      is_legendary: d.is_legendary,
      is_mythical: d.is_mythical,
      evolves_from: d.evolves_from_species?.name ?? null,
      evolution_chain_url: d.evolution_chain.url,
    };
  }

  private parseMove(d: MoveApiResponse) {
    const englishEffect = d.effect_entries.find((e) => e.language.name === 'en');
    return {
      id: d.id,
      name: d.name,
      type: d.type.name,
      damage_class: d.damage_class.name,
      power: d.power,
      accuracy: d.accuracy,
      pp: d.pp,
      priority: d.priority,
      effect_chance: d.effect_chance,
      short_effect: englishEffect?.short_effect ?? null,
      effect: englishEffect?.effect ?? null,
      target: d.target.name,
      generation: d.generation.name,
      meta: d.meta
        ? {
            ailment: d.meta.ailment.name,
            category: d.meta.category.name,
            min_hits: d.meta.min_hits,
            max_hits: d.meta.max_hits,
            drain: d.meta.drain,
            healing: d.meta.healing,
            crit_rate: d.meta.crit_rate,
            ailment_chance: d.meta.ailment_chance,
            flinch_chance: d.meta.flinch_chance,
            stat_chance: d.meta.stat_chance,
          }
        : null,
    };
  }

  private parseType(d: TypeApiResponse) {
    const dr = d.damage_relations;
    return {
      id: d.id,
      name: d.name,
      generation: d.generation.name,
      move_damage_class: d.move_damage_class?.name ?? null,
      damage_relations: {
        double_damage_to: dr.double_damage_to.map((t) => t.name),
        half_damage_to: dr.half_damage_to.map((t) => t.name),
        no_damage_to: dr.no_damage_to.map((t) => t.name),
        double_damage_from: dr.double_damage_from.map((t) => t.name),
        half_damage_from: dr.half_damage_from.map((t) => t.name),
        no_damage_from: dr.no_damage_from.map((t) => t.name),
      },
      pokemon_count: d.pokemon.length,
      move_count: d.moves.length,
    };
  }
}
