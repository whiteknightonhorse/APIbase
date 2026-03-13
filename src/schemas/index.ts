import { type ZodSchema } from 'zod';
import { weatherSchemas } from './weather.schema';
import { cryptoSchemas } from './crypto.schema';
import { polymarketSchemas } from './polymarket.schema';
import { aviasalesSchemas } from './aviasales.schema';
import { sabreSchemas } from './sabre.schema';
import { amadeusSchemas } from './amadeus.schema';
import { hyperliquidSchemas } from './hyperliquid.schema';
import { asterdexSchemas } from './asterdex.schema';
import { foursquareSchemas } from './foursquare.schema';
import { ticketmasterSchemas } from './ticketmaster.schema';
import { tmdbSchemas } from './tmdb.schema';
import { healthSchemas } from './health.schema';
import { financeSchemas } from './finance.schema';

export const toolSchemas: Record<string, ZodSchema> = {
  ...weatherSchemas,
  ...cryptoSchemas,
  ...polymarketSchemas,
  ...aviasalesSchemas,
  ...sabreSchemas,
  ...amadeusSchemas,
  ...hyperliquidSchemas,
  ...asterdexSchemas,
  ...foursquareSchemas,
  ...ticketmasterSchemas,
  ...tmdbSchemas,
  ...healthSchemas,
  ...financeSchemas,
};
