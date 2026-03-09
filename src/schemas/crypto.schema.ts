import { z, type ZodSchema } from 'zod';

const networkEnum = z.enum([
  'ethereum',
  'bsc',
  'polygon',
  'arbitrum',
  'solana',
  'base',
  'avalanche',
  'optimism',
]);

const cryptoGetPrice = z
  .object({
    coins: z.array(z.string()).max(50),
    vs_currencies: z.array(z.string()).optional(),
    include_24h_change: z.boolean().optional(),
    include_market_cap: z.boolean().optional(),
    include_volume: z.boolean().optional(),
  })
  .strip();

const coingeckoGetMarket = z
  .object({
    category: z
      .enum([
        'defi',
        'layer-1',
        'layer-2',
        'gaming',
        'ai-big-data',
        'meme-token',
        'stablecoins',
        'nft',
        'exchange-based-tokens',
        'real-world-assets',
      ])
      .optional(),
    sort_by: z
      .enum([
        'market_cap_desc',
        'market_cap_asc',
        'volume_desc',
        'price_desc',
        'price_change_24h_desc',
      ])
      .optional(),
    limit: z.number().int().max(250).optional(),
    include_sparkline: z.boolean().optional(),
  })
  .strip();

const cryptoCoinDetail = z
  .object({
    coin_id: z.string(),
    include_description: z.boolean().optional(),
    include_developer: z.boolean().optional(),
    include_community: z.boolean().optional(),
  })
  .strip();

const cryptoPriceHistory = z
  .object({
    coin_id: z.string(),
    days: z.number().int().max(365).optional(),
    interval: z.enum(['5m', 'hourly', 'daily']).optional(),
    format: z.enum(['timeseries', 'ohlcv']).optional(),
  })
  .strip();

const cryptoTrending = z
  .object({
    include_nfts: z.boolean().optional(),
    include_categories: z.boolean().optional(),
  })
  .strip();

const cryptoGlobal = z
  .object({
    include_defi: z.boolean().optional(),
  })
  .strip();

const cryptoDexPools = z
  .object({
    query: z.string().optional(),
    network: networkEnum.optional(),
    sort_by: z.enum(['volume_24h', 'liquidity', 'price_change_24h', 'transactions_24h']).optional(),
    limit: z.number().int().max(50).optional(),
  })
  .strip();

const cryptoTokenByAddress = z
  .object({
    contract_address: z.string(),
    network: networkEnum.optional(),
  })
  .strip();

const cryptoSearch = z
  .object({
    query: z.string(),
  })
  .strip();

export const cryptoSchemas: Record<string, ZodSchema> = {
  'crypto.get_price': cryptoGetPrice,
  'coingecko.get_market': coingeckoGetMarket,
  'crypto.coin_detail': cryptoCoinDetail,
  'crypto.price_history': cryptoPriceHistory,
  'crypto.trending': cryptoTrending,
  'crypto.global': cryptoGlobal,
  'crypto.dex_pools': cryptoDexPools,
  'crypto.token_by_address': cryptoTokenByAddress,
  'crypto.search': cryptoSearch,
};
