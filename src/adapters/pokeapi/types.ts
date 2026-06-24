/** Named resource reference (name + URL) as used throughout PokéAPI. */
export interface NamedResource {
  name: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Pokemon detail
// ---------------------------------------------------------------------------

export interface PokemonStat {
  stat: NamedResource;
  base_stat: number;
  effort: number;
}

export interface PokemonType {
  slot: number;
  type: NamedResource;
}

export interface PokemonAbility {
  ability: NamedResource;
  is_hidden: boolean;
  slot: number;
}

export interface PokemonMove {
  move: NamedResource;
}

export interface PokemonSprites {
  front_default: string | null;
  front_shiny: string | null;
}

export interface PokemonApiResponse {
  id: number;
  name: string;
  base_experience: number | null;
  height: number;
  weight: number;
  is_default: boolean;
  order: number;
  types: PokemonType[];
  stats: PokemonStat[];
  abilities: PokemonAbility[];
  moves: PokemonMove[];
  sprites: PokemonSprites;
  species: NamedResource;
}

// ---------------------------------------------------------------------------
// Pokemon species
// ---------------------------------------------------------------------------

export interface FlavorTextEntry {
  flavor_text: string;
  language: NamedResource;
  version: NamedResource;
}

export interface Genus {
  genus: string;
  language: NamedResource;
}

export interface PokemonSpeciesApiResponse {
  id: number;
  name: string;
  order: number;
  gender_rate: number;
  capture_rate: number;
  base_happiness: number | null;
  is_baby: boolean;
  is_legendary: boolean;
  is_mythical: boolean;
  hatch_counter: number | null;
  has_gender_differences: boolean;
  forms_switchable: boolean;
  growth_rate: NamedResource;
  egg_groups: NamedResource[];
  color: NamedResource;
  shape: NamedResource | null;
  evolves_from_species: NamedResource | null;
  evolution_chain: { url: string };
  habitat: NamedResource | null;
  generation: NamedResource;
  flavor_text_entries: FlavorTextEntry[];
  genera: Genus[];
}

// ---------------------------------------------------------------------------
// Move detail
// ---------------------------------------------------------------------------

export interface EffectEntry {
  effect: string;
  short_effect: string;
  language: NamedResource;
}

export interface MoveApiResponse {
  id: number;
  name: string;
  accuracy: number | null;
  effect_chance: number | null;
  pp: number | null;
  priority: number;
  power: number | null;
  damage_class: NamedResource;
  type: NamedResource;
  target: NamedResource;
  contest_type: NamedResource | null;
  generation: NamedResource;
  effect_entries: EffectEntry[];
  meta: {
    ailment: NamedResource;
    category: NamedResource;
    min_hits: number | null;
    max_hits: number | null;
    min_turns: number | null;
    max_turns: number | null;
    drain: number;
    healing: number;
    crit_rate: number;
    ailment_chance: number;
    flinch_chance: number;
    stat_chance: number;
  } | null;
}

// ---------------------------------------------------------------------------
// Type matchup
// ---------------------------------------------------------------------------

export interface TypeDamageRelations {
  no_damage_to: NamedResource[];
  half_damage_to: NamedResource[];
  double_damage_to: NamedResource[];
  no_damage_from: NamedResource[];
  half_damage_from: NamedResource[];
  double_damage_from: NamedResource[];
}

export interface TypeApiResponse {
  id: number;
  name: string;
  damage_relations: TypeDamageRelations;
  generation: NamedResource;
  move_damage_class: NamedResource | null;
  pokemon: Array<{ pokemon: NamedResource; slot: number }>;
  moves: NamedResource[];
}
