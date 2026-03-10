import { type ZodSchema } from 'zod';
import { weatherSchemas } from './weather.schema';
import { cryptoSchemas } from './crypto.schema';
import { polymarketSchemas } from './polymarket.schema';
import { aviasalesSchemas } from './aviasales.schema';
import { sabreSchemas } from './sabre.schema';

export const toolSchemas: Record<string, ZodSchema> = {
  ...weatherSchemas,
  ...cryptoSchemas,
  ...polymarketSchemas,
  ...aviasalesSchemas,
  ...sabreSchemas,
};
