import { z } from 'zod';

const nameOrId = z
  .union([z.string(), z.number()])
  .describe(
    'Pokemon name (e.g. "pikachu", "charizard") or numeric Pokedex ID (e.g. 25, 6). ' +
      'Names are case-insensitive. Hyphenated forms accepted (e.g. "mr-mime", "tapu-koko").',
  );

export const pokeapiSchemas: Record<string, z.ZodSchema> = {
  'pokeapi.pokemon': z
    .object({
      name_or_id: nameOrId,
    })
    .strip(),

  'pokeapi.species': z
    .object({
      name_or_id: z
        .union([z.string(), z.number()])
        .describe(
          'Pokemon species name (e.g. "bulbasaur") or species ID (e.g. 1). ' +
            'Use the base species name, not form names (use "rotom" not "rotom-heat").',
        ),
    })
    .strip(),

  'pokeapi.move': z
    .object({
      name_or_id: z
        .union([z.string(), z.number()])
        .describe(
          'Move name (e.g. "tackle", "thunderbolt", "surf") or numeric move ID (e.g. 33). ' +
            'Names use hyphens for multi-word moves (e.g. "ice-beam", "fire-blast").',
        ),
    })
    .strip(),

  'pokeapi.type': z
    .object({
      name_or_id: z
        .union([z.string(), z.number()])
        .describe(
          'Pokemon type name (e.g. "fire", "water", "grass", "electric", "dragon", "ghost") ' +
            'or numeric type ID (e.g. 10 for fire, 11 for water). ' +
            'Valid types: normal, fighting, flying, poison, ground, rock, bug, ghost, steel, ' +
            'fire, water, grass, electric, psychic, ice, dragon, dark, fairy.',
        ),
    })
    .strip(),
};
